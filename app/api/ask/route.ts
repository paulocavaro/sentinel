import { z } from 'zod'

import { listEditionDates } from '@/lib/edition'
import { MAX_QUESTIONS, MAX_QUESTION_CHARS, askArchive, defaultGenerator } from '@/lib/search/ask'
import type { AskResult, Generator } from '@/lib/search/ask'
import { archiveIndex } from '@/lib/search/corpus'
import { bucketKey, takeToken } from '@/lib/search/limit'

/**
 * The one runtime route on this site.
 *
 * Everything else here is a dated file rendered at build time; this is the only
 * thing that runs when a reader does something, and the only thing that costs
 * money to serve. That is why it is written as a sequence of refusals with the
 * work at the end, and why it says so little when it refuses.
 *
 * It owns four things and no more: which caller is asking, whether the body is
 * a question at all, where the archive is, and what status each of
 * `askArchive`'s three answers deserves. Every judgement about the *answer* —
 * whether an id was earned, whether a refusal is honest — was made in
 * `lib/search/` and is not revisited here.
 */

/**
 * The archive is read off the filesystem, and no other runtime can do that.
 *
 * Node is the default today. Declaring it is the difference between a property
 * this route depends on and a default someone may change for an unrelated
 * reason — the failure would be an `ENOENT` in production on a route that is
 * green in every test.
 */
export const runtime = 'nodejs'

/**
 * The ceiling on one question.
 *
 * A tool loop is bounded by `stepCountIs(4)` in steps and by nothing in time;
 * left alone it would inherit the platform's 300 seconds, which is 300 seconds
 * of a reader watching a rule fill. Thirty is generous for four steps of a
 * medium-effort call and short enough that a stuck one is over quickly.
 */
export const maxDuration = 30

/**
 * The body, and there is deliberately no field an answer could arrive in.
 *
 * `z.strictObject` rather than a permissive one: the design's guarantee is that
 * only questions travel, and a schema that quietly ignored an `answers` key
 * would make that guarantee true by accident rather than by construction.
 *
 * `previous` is capped rather than truncated. `askArchive` already slices to
 * the last two, so accepting five would work — and a client sending five is
 * either broken or probing, and both are worth a 400 rather than a silent
 * repair.
 */
const BodySchema = z.strictObject({
  question: z.string().trim().min(1).max(MAX_QUESTION_CHARS),
  previous: z
    .array(z.string().trim().min(1).max(MAX_QUESTION_CHARS))
    .max(MAX_QUESTIONS - 1)
    .optional(),
})

/**
 * The model call, in the one place a test can replace it.
 *
 * **Why an object and not a module mock.** The alternative is
 * `vi.mock('@/lib/search/ask')`, which replaces `askArchive` along with the
 * generator — and wiring the real `askArchive` to the real index is the only
 * thing this route does. A test written that way would assert that a stub
 * returns what the stub was told to return.
 *
 * The production default is the real generator, and it is the value of this
 * property at import: nothing has to be configured, wired, or remembered for
 * the deployed route to call a model. A test assigns over it and puts it back.
 * The seam is one mutable property, typed, in the module it belongs to — the
 * same shape `curate.ts` uses for the same reason.
 */
export const deps: { generate: Generator } = { generate: defaultGenerator }

/**
 * What a caller gets when there is no answer to send.
 *
 * The sentence is not the one the reader sees — the panel owns its own copy,
 * designed, in `states.html` — but a route that answers `{"kind":"failed"}` and
 * nothing else is unreadable to anything that is not the panel. So each failure
 * carries one plain sentence, fixed text, built from nothing the caller sent.
 *
 * **Nothing from the request reaches this function.** Not the question, not a
 * parse error naming the field, not the provider's message. A question is
 * reader-typed text, and an error body that quotes it makes the route a
 * reflector for whatever was posted; a cause is ours and belongs in the log.
 */
function refuse(status: number, kind: string, message: string, headers?: HeadersInit): Response {
  return Response.json({ kind, message }, { status, headers })
}

export async function POST(request: Request): Promise<Response> {
  // 1. The rate limit, before any I/O.
  //
  // First because the order is the whole of what it buys. Written after the
  // read, the limiter still answers 429 — and still lets the caller it is
  // blocking make the server build an index and parse a body on the way there.
  const limit = takeToken(bucketKey(request.headers))
  if (!limit.ok) {
    return refuse(429, 'limited', 'Too many questions from here. Try again in a few minutes.', {
      // Seconds, which is what the header is defined in and what `takeToken`
      // returns. The body carries it too: the panel needs the number, and
      // reading a response header is not what it is written to do.
      'retry-after': String(limit.retryAfter),
    })
  }

  // 2. The body, before the archive.
  //
  // `request.json()` throws on anything that is not JSON, and a throw out of a
  // route handler is a 500 with a stack in it. Catching it here is what turns
  // a malformed body into the status it deserves.
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return refuse(400, 'invalid', 'That request could not be read.')
  }

  const parsed = BodySchema.safeParse(body)
  // The issues are deliberately dropped rather than reported. Zod's messages
  // name fields and received types, and a body a stranger posted is not
  // something to quote back at them.
  if (!parsed.success) return refuse(400, 'invalid', 'That request could not be read.')

  let result: AskResult
  try {
    // 3. The archive. Cached per instance, so only the first question of an
    //    instance pays for it; the dates are a directory listing and are
    //    fetched alongside rather than after.
    const [index, dates] = await Promise.all([archiveIndex(), listEditionDates()])

    // 4. The question.
    result = await askArchive({ index, dates, generate: deps.generate }, parsed.data)
  } catch (cause) {
    // `askArchive` catches the model's own failures and does not throw, so
    // arriving here means the archive itself could not be read — a real
    // operational fault, and the one case where the log is the only record
    // there will ever be.
    console.error('[api/ask] the archive could not be read', cause)
    return refuse(500, 'failed', 'The search could not run. Try again.')
  }

  if (result.kind === 'failed') {
    // Three different events reach this line — the provider fell over, the
    // model answered without searching, or the answer cited something it was
    // never shown — and `askArchive` collapses them into one on purpose,
    // because the reader is told the same thing for all three. The cost is
    // that the log cannot tell them apart either, which is worth writing down
    // rather than discovering while reading logs at the wrong moment.
    console.error('[api/ask] no answer survived: the model call failed or the object was rejected')
    return refuse(500, 'failed', 'The search could not run. Try again.')
  }

  // A refusal is a 200. "Nothing about that has run here" is a correct,
  // complete answer about a dated record, and the state the product is proudest
  // of — a 404 or a 204 would file it as a failure of the request.
  return Response.json(result)
}
