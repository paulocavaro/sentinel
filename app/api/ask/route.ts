import { z } from 'zod'

import { listEditionDates } from '@/lib/edition'
import { MAX_QUESTIONS, MAX_QUESTION_CHARS, askArchive, defaultGenerator } from '@/lib/search/ask'
import type { AskFailure, AskResult, Generator } from '@/lib/search/ask'
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
function refuse(
  status: number,
  kind: string,
  message: string,
  { headers, ...extra }: { headers?: HeadersInit; retryAfter?: number } = {},
): Response {
  return Response.json({ kind, message, ...extra }, { status, headers })
}

/**
 * One row per way an answer can fail to survive: what the log says, what the
 * status is, and what the caller is told.
 *
 * **The statuses differ because only one of these is a fault of this server.**
 * That distinction was worth making the day production started failing about one
 * question in six and every one of them was a 500 — a status that says *this
 * server is broken*, on a path where the server was mostly working exactly as
 * designed. A 500 in the dashboard should mean something is wrong here.
 *
 * - `rejected` and `unsearched` are **200**, for the same reason `nothing` is:
 *   the request was handled correctly and the answer is the honest outcome. The
 *   system looked at a draft it could not verify against the archive and
 *   declined to show it. That is the product working. The panel renders its
 *   `failed` state from the body's `kind`, not from the status, so the reader
 *   sees no difference.
 * - `provider` is **503**: the model was unreachable or refused. Genuinely
 *   upstream, genuinely transient, and a status a monitor should be allowed to
 *   alert on.
 * - `invalid` is **400** and is unreachable from here — the body schema rejects
 *   an empty or over-long question long before `askArchive` sees it. It is in
 *   the table because the type says it can happen, and a table with a hole in it
 *   is how the next reader learns nothing.
 */
const FAILURES: Record<AskFailure, { status: number; log: string; message: string }> = {
  invalid: {
    status: 400,
    log: 'the question was empty or over the cap — the body schema should have caught this',
    message: 'That request could not be read.',
  },
  provider: {
    status: 503,
    log: 'the model call threw — provider unreachable, rate limited, or the SDK rejected the schema',
    message: 'The search could not run. Try again.',
  },
  unsearched: {
    status: 200,
    log: 'the model answered without searching, over material the archive holds',
    message: 'That question could not be answered from the archive.',
  },
  rejected: {
    status: 200,
    log: 'the answer failed validation twice — most likely a citation the model was never shown',
    message: 'That answer could not be checked against the archive, so it was not shown.',
  },
}

export async function POST(request: Request): Promise<Response> {
  // 1. The rate limit, before any I/O.
  //
  // First because the order is the whole of what it buys. Written after the
  // read, the limiter still answers 429 — and still lets the caller it is
  // blocking make the server build an index and parse a body on the way there.
  const limit = takeToken(bucketKey(request.headers))
  if (!limit.ok) {
    return refuse(429, 'limited', 'Too many questions from here. Try again shortly.', {
      // Seconds, which is what `Retry-After` is defined in and what `takeToken`
      // returns. **The body carries it too**, and the comment used to claim that
      // while `refuse` built `{ kind, message }` and nothing else — so the panel
      // could not name a wait and said "a few minutes" whatever the number was.
      // The header is for anything speaking HTTP; the body is for the panel,
      // which is written to read JSON and would otherwise reach for a header to
      // find the one number it needs.
      headers: { 'retry-after': String(limit.retryAfter) },
      retryAfter: limit.retryAfter,
    })
  }

  // 2. The body, before the archive.
  //
  // **The content type is checked, and it is a real control rather than
  // tidiness.** Without it any page on the internet can spend this site's model
  // budget: `sendBeacon` with a `text/plain` blob is a CORS-safelisted request,
  // so it skips the preflight entirely and arrives here as a perfectly valid
  // body — `request.json()` does not care what the header said. The attacker
  // cannot read the answer, because no CORS header lets them, but they do not
  // need to. Every visitor to their page buys a Sonnet 5 call on our account and
  // burns *their own* ten-question allowance, since the bucket key is the
  // visitor's IP. Requiring `application/json` forces a preflight that never
  // succeeds, and the panel's own `fetch` already sends it.
  if (!(request.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
    return refuse(415, 'invalid', 'That request could not be read.')
  }

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
    const { status, log, message } = FAILURES[result.why]
    console.error(`[api/ask] ${log}`)
    return refuse(status, 'failed', message)
  }

  // A refusal is a 200. "Nothing about that has run here" is a correct,
  // complete answer about a dated record, and the state the product is proudest
  // of — a 404 or a 204 would file it as a failure of the request.
  return Response.json(result)
}
