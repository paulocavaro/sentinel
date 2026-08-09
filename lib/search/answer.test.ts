// The refusal, tested as the product feature it is.
//
// Almost every case below is a rejection, and that is the right shape for this
// file: an answer that reads well is the easy half, and the half a model gets
// right unprompted. What has to be proven is that the ids are *earned* — that
// nothing the search did not return can reach a reader with a date and a link
// under it.
//
// `seen` is built by hand rather than by running a search, so each case says
// exactly which ids were on the table. Task 3 owns the wiring that fills the
// map from real tool results; this file owns the rule applied to it.
//
// Ids are twelve hex characters because that is what the pipeline writes, and
// the unseen ones are the same shape as the seen ones on purpose. An id of
// `nope` would prove only that a validator can spot an obvious stranger.

import { describe, expect, it } from 'vitest'

import { item } from '@/app/__fixtures__/archive'
import { AnswerSchema, validateAnswer } from './answer'
import type { Hit } from './corpus'

const OPUS = '4f9c2a1b8e30'
const QUANTUM = '7b1d6e05aa92'
const ANTITRUST = 'c0e83f47b115'

/** An id of exactly the right shape that no edition ever carried. */
const UNSEEN = 'ab12cd34ef56'

function hit(id: string, date: string, over: Partial<Hit> = {}): Hit {
  return { ...item({ id }), date, ...over }
}

/** What the tool returned on this call, and nothing else. */
const SEEN = new Map<string, Hit>([
  [OPUS, hit(OPUS, '2026-08-09', { title: 'Anthropic ships Claude Opus 5' })],
  [QUANTUM, hit(QUANTUM, '2026-08-08', { title: 'A quantum processor holds its state' })],
  [ANTITRUST, hit(ANTITRUST, '2026-08-07', { title: 'The EU opens an antitrust case' })],
])

describe('validateAnswer', () => {
  it('accepts an answer whose every id was returned by the search', () => {
    const answer = validateAnswer(
      {
        kind: 'answer',
        sentences: [
          { text: 'Anthropic released Opus 5.', ids: [OPUS] },
          { text: 'Error correction, not qubit count, is what moved.', ids: [QUANTUM] },
        ],
      },
      SEEN,
    )

    expect(answer).toEqual({
      kind: 'answer',
      sentences: [
        { text: 'Anthropic released Opus 5.', cites: [{ id: OPUS, date: '2026-08-09' }] },
        {
          text: 'Error correction, not qubit count, is what moved.',
          cites: [{ id: QUANTUM, date: '2026-08-08' }],
        },
      ],
    })
  })

  it('resolves each id to the date its item ran', () => {
    // The dates below are on no object the model produced: each one is read out
    // of `seen`, which the tool filled. The raw sentence carries a `date` of its
    // own — a model that decides to volunteer one — and it does not survive.
    //
    // **What actually protects this is the schema, not this assertion**, and the
    // difference was found by mutation: rewriting `validateAnswer` to prefer a
    // model-supplied date leaves all of these green, because `safeParse` has
    // already stripped the unknown key by the time the code could read it. The
    // model has no channel to supply a date at all. Trusting one would take two
    // deliberate changes — adding `date` to `AnswerSchema` and then reading it —
    // and the first is visible in the schema, where this comment sends you.
    //
    // This case is still worth keeping: it pins that an extra key is ignored
    // rather than rejected, which is what lets the schema evolve without the
    // model's stray fields becoming errors.
    const answer = validateAnswer(
      {
        kind: 'answer',
        sentences: [
          { text: 'Two of them landed the same week.', ids: [OPUS, ANTITRUST], date: '1999-01-01' },
        ],
      },
      SEEN,
    )

    expect(answer).toEqual({
      kind: 'answer',
      sentences: [
        {
          text: 'Two of them landed the same week.',
          cites: [
            { id: OPUS, date: '2026-08-09' },
            { id: ANTITRUST, date: '2026-08-07' },
          ],
        },
      ],
    })
  })

  // The whole point of the phase.
  it('rejects the whole answer when one id was never returned', () => {
    expect(
      validateAnswer(
        {
          kind: 'answer',
          sentences: [
            { text: 'Anthropic released Opus 5.', ids: [OPUS] },
            { text: 'And a rival matched it the next morning.', ids: [UNSEEN] },
          ],
        },
        SEEN,
      ),
    ).toBeNull()
  })

  it('rejects an id that looks right but ran in no edition', () => {
    // One sentence, one id, nothing else wrong with the object. The id has the
    // shape the pipeline writes, so nothing but membership in `seen` separates
    // it from a real one — which is the only test that matters.
    expect(
      validateAnswer(
        { kind: 'answer', sentences: [{ text: 'A story that never ran.', ids: [UNSEEN] }] },
        SEEN,
      ),
    ).toBeNull()
  })

  it('rejects a sentence with no ids at all', () => {
    // An uncited sentence is the invented answer wearing the shape of a valid
    // one: it reads as prose from the archive and rests on nothing.
    expect(
      validateAnswer(
        {
          kind: 'answer',
          sentences: [
            { text: 'Anthropic released Opus 5.', ids: [OPUS] },
            { text: 'Which is broadly what everyone expected.', ids: [] },
          ],
        },
        SEEN,
      ),
    ).toBeNull()
  })

  it('rejects an empty sentence list', () => {
    // An answer that says nothing is not an answer. The refusal has its own
    // shape, and this is not it.
    expect(validateAnswer({ kind: 'answer', sentences: [] }, SEEN)).toBeNull()
  })

  // Not repaired, dropped. A complete-looking answer minus one citation
  // reads as a complete answer.
  it('does not drop the offending sentence and keep the rest', () => {
    const sound = { text: 'Anthropic released Opus 5.', ids: [OPUS] }
    const forged = { text: 'A regulator opened a case the same day.', ids: [UNSEEN] }

    expect(validateAnswer({ kind: 'answer', sentences: [sound, forged] }, SEEN)).toBeNull()

    // And the two sentences it was refused with are otherwise fine — the same
    // object without the forged one validates. So the `null` above is the rule
    // firing, not the sound sentence being bad too, and a validator that
    // dropped rather than refused would have returned exactly this.
    expect(validateAnswer({ kind: 'answer', sentences: [sound] }, SEEN)).toEqual({
      kind: 'answer',
      sentences: [{ text: sound.text, cites: [{ id: OPUS, date: '2026-08-09' }] }],
    })
  })

  it('accepts the refusal, which carries no ids by construction', () => {
    // The refusal is a member of the union rather than an answer with no
    // sentences, so there is no shape a failed answer and an honest "nothing
    // here" can share. The caller in Task 3 adds the counts a reader sees.
    expect(validateAnswer({ kind: 'nothing' }, SEEN)).toEqual({ kind: 'nothing' })
    expect(validateAnswer({ kind: 'nothing' }, new Map())).toEqual({ kind: 'nothing' })
  })

  it('rejects a malformed object rather than throwing', () => {
    // Everything a failed generation can hand back. None of it may throw: the
    // route turns a `null` into one honest sentence, and an exception into a
    // 500 the reader cannot act on.
    for (const raw of [
      undefined,
      null,
      'an answer, in prose',
      42,
      [],
      {},
      { kind: 'maybe', sentences: [] },
      { kind: 'answer' },
      { kind: 'answer', sentences: 'Anthropic released Opus 5.' },
      { kind: 'answer', sentences: [{ ids: [OPUS] }] },
      { kind: 'answer', sentences: [null] },
    ]) {
      expect(validateAnswer(raw, SEEN)).toBeNull()
    }
  })

  it('rejects text that is not a string, and ids that are not strings', () => {
    expect(
      validateAnswer({ kind: 'answer', sentences: [{ text: 7, ids: [OPUS] }] }, SEEN),
    ).toBeNull()

    // The dangerous one: `ids` full of objects would make `seen.get` return
    // `undefined` for each and refuse anyway, but only by accident. The schema
    // says so first.
    expect(
      validateAnswer({ kind: 'answer', sentences: [{ text: 'A sentence.', ids: [{ id: OPUS }] }] }, SEEN),
    ).toBeNull()
    expect(
      validateAnswer({ kind: 'answer', sentences: [{ text: 'A sentence.', ids: OPUS }] }, SEEN),
    ).toBeNull()
  })

  it('rejects a sentence whose text is only whitespace', () => {
    // `z.string().min(1)` accepts a single space, and a blank sentence with a
    // valid citation under it is a citation attached to nothing.
    expect(
      validateAnswer({ kind: 'answer', sentences: [{ text: ' ', ids: [OPUS] }] }, SEEN),
    ).toBeNull()
    expect(
      validateAnswer({ kind: 'answer', sentences: [{ text: '\n\t  ', ids: [OPUS] }] }, SEEN),
    ).toBeNull()
  })
})

describe('AnswerSchema', () => {
  it('discriminates on kind, so a refusal cannot carry sentences it forgot to drop', () => {
    // Exported for Task 3 to hand to the model as the structured output shape,
    // so its two members are asserted here rather than only through
    // `validateAnswer`. Extra keys are stripped, not rejected: a model that
    // volunteers a field costs nothing, and a thrown parse error would cost the
    // whole call.
    expect(AnswerSchema.safeParse({ kind: 'nothing', sentences: [] }).success).toBe(true)
    expect(AnswerSchema.safeParse({ kind: 'nothing' }).data).toEqual({ kind: 'nothing' })
    expect(AnswerSchema.safeParse({ kind: 'refusal' }).success).toBe(false)
  })
})
