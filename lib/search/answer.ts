import { z } from 'zod'

import type { Hit } from './corpus'

/**
 * The shape an answer must take, and the rule that an id must be earned.
 *
 * This is where the product's second principle stops being an instruction and
 * becomes a property. The prompt in Task 3 asks the model to answer only from
 * what the search returned; every prompt ever written asks for something, and a
 * news product that invents is worse than one that is silent. So the ids the
 * model writes are checked here against the ids the tool actually handed it on
 * this call, and an answer that cites anything else does not reach a reader.
 *
 * **A violation refuses the whole answer.** The tempting version drops the
 * offending sentence and renders the rest, which is worse than useless: what
 * arrives on screen is a complete-looking answer, in the product's own voice,
 * with no sign that a claim was removed from the middle of it. The reader
 * cannot see the hole and so cannot discount the paragraph. Refusing outright
 * makes the failure visible, and the caller says something honest — *"I could
 * not answer that"* — which is a sentence the product can stand behind.
 *
 * **Nothing here throws, and nothing here repairs.** The single `null` is the
 * whole vocabulary of failure, because every caller does the same thing with
 * every kind of failure: says so. Repair is the other name for inventing.
 */

/**
 * **Shape only, and `ids` stays `z.string()`.**
 *
 * `z.enum([...seen.keys()])` is the obvious thing to write and it is the wrong
 * thing, for the reason `CurationSchema` records in as many words: the AI SDK
 * validates the schema client-side *after* generation, so a schema narrow
 * enough to reject a bad id turns it into a thrown `NoObjectGeneratedError` and
 * loses the whole call — including the sentences that were correct, and
 * including the information that the model tried to cite something it was never
 * shown. As a plain string the object arrives, `validateAnswer` refuses it, and
 * the caller has an answer it can act on.
 *
 * `.trim().min(1)` rather than `.min(1)`: the latter accepts a single space,
 * and a blank sentence with a citation under it is a dated link attached to
 * nothing.
 *
 * Two members, discriminated, so **the refusal is a first-class answer rather
 * than an empty one**. Were "nothing here" spelled as `sentences: []`, it would
 * be indistinguishable from a generation that failed halfway — and the reader
 * would be told the archive has no such story on days when the truth is that
 * the model fell over.
 */
export const AnswerSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('answer'),
    sentences: z
      .array(
        z.object({
          text: z.string().trim().min(1),
          ids: z.array(z.string()).min(1),
        }),
      )
      .min(1),
  }),
  z.object({ kind: z.literal('nothing') }),
])

/** What the model returns: sentences carrying bare ids, none of them trusted yet. */
export type RawAnswer = z.infer<typeof AnswerSchema>

/**
 * One citation, resolved.
 *
 * **Every field here is read from `seen`, never from the model.** They are facts
 * about the archive — which edition the item ran in, who published it, where it
 * lives — and they are the whole of what makes a claim checkable. A model that
 * volunteered any of them would be volunteering its own proof, and the check
 * would pass against its own claim.
 *
 * `url` and `publisher` are here because a citation that reached only the
 * edition page made the reader hunt for the story among thirty. Naming the
 * outlet and going to the article is the difference between a citation that can
 * be verified and one that can only be believed.
 */
export type Citation = { id: string; date: string; url: string; publisher: string }

/** A sentence of the answer, and the items it rests on. */
export type Sentence = { text: string; cites: Citation[] }

/** An answer that has earned every id in it, or the refusal. */
export type Answer = { kind: 'answer'; sentences: Sentence[] } | { kind: 'nothing' }

/**
 * The generated object, checked against the items the search actually returned.
 *
 * `seen` is built by the caller as the tool runs — one entry per hit, per
 * search, accumulated across the whole tool loop — so it is precisely the set
 * of items the model was shown and nothing wider. An id from a search the model
 * did not run, or from its own memory of the news, is absent from it.
 *
 * Returns `null` on any violation: a malformed object, a sentence that cites
 * nothing, or a single id that was never returned. The caller cannot tell the
 * three apart, and does not need to — all three mean the same thing to a
 * reader, and a caller that could tell them apart would be tempted to handle
 * the third one leniently.
 */
export function validateAnswer(raw: unknown, seen: Map<string, Hit>): Answer | null {
  const parsed = AnswerSchema.safeParse(raw)
  if (!parsed.success) return null

  const answer = parsed.data
  if (answer.kind === 'nothing') return { kind: 'nothing' }

  const sentences: Sentence[] = []

  for (const sentence of answer.sentences) {
    const cites: Citation[] = []

    for (const id of sentence.ids) {
      const hit = seen.get(id)
      // The return is from the whole function, not from this loop. It is the
      // one line of this module worth reading twice.
      if (!hit) return null
      cites.push({ id, date: hit.date, url: hit.url, publisher: hit.publisher })
    }

    sentences.push({ text: sentence.text, cites })
  }

  return { kind: 'answer', sentences }
}
