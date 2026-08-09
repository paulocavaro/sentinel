// The ask panel: the drawer the archive is questioned through.
//
// It is a `<dialog>` and the browser owns everything about being a dialog.
// `showModal()` supplies Escape, a focus trap, an inert background, a real
// backdrop and returning focus to the opener — the five things a hand-rolled
// drawer gets wrong — and every one of them is the browser's, not this file's.
// The only DOM call the feature makes is still the `showModal()` in `AskButton`.
//
// **`display` stays scoped to `[open]` in `app/globals.css`.** A bare
// `display: flex` on a dialog overrides the UA's `display: none` for the closed
// state, so the panel renders open from page load and can never be closed —
// that is in this repo's history, the stylesheet carries the fix and the comment
// beside it, and nothing here reintroduces it. Nothing in this file styles the
// element at all.
//
// **The field is live, and the panel now has states.** Their markup comes from
// `design-refs/states.html` and not from here: frame 05 is the running line and
// the answer, 06 is the refusal, 07 is a question after a question. Every class
// below — `.ask-line`, `.ask-q`, `.ask-bar`, `.ask-a`, `.cite`, `.ask-past` — is
// already in `app/globals.css` because it is already in the reference. No state
// invented a component, and the one that needed a new one (07) was designed
// first, in its own task, before this file was allowed to render it.
//
// **The reference's three example questions are gone — from the design, not
// only from here.** Three questions written by hand when the archive held two
// editions age, fixed, into a product whose first act is to say it does not
// know, and a reader who has opened this panel already knows what they want. The
// `<ul class="panel-examples">` block and the `.panel-examples` and `.example`
// rules left `design-refs/build-home.mjs` and `app/globals.css` in the same
// commit, so the two copies of that stylesheet remain one document. What came
// back with them is the reference's real placeholder, which a field that could
// do nothing had no right to.
//
// **A citation is a story, and it leaves the site.** It reads *outlet · day* and
// it goes to the article. The first version linked at `/day/YYYY-MM-DD`, the
// whole edition, which made a reader who wanted to check one claim hunt for it
// among thirty items — a citation that can only be believed. What is printed
// beside the link is the outlet and not only the day because a label reading
// "9 August" over a click that lands on techcrunch.com is a label disagreeing
// with its own destination, and this repository has already paid for that kind
// of mislabelling once, on the morning 18 of 20 bylines named the feed instead
// of the publisher. Both fields come from `seen` in `lib/search/answer.ts` and
// never from the model; nothing here re-derives either, not even the host out of
// the url.
//
// **Only questions travel, and the series dies with the dialog.** A follow-up
// posts the earlier *questions* and nothing else; there is no field an answer
// could arrive in, which removes the forged-assistant-turn surface rather than
// defending against it. Three questions to a series and the fourth starts clean,
// silently — a line explaining the rule would be a line about the software
// rather than about the news. Closing the panel drops the series, and that is
// `onClose` on the `<dialog>`, which fires for the close button, for Escape and
// for the backdrop without three handlers agreeing with each other.
//
// **Never `dangerouslySetInnerHTML`.** The answer is assembled from sentences
// that quote titles and descriptions written by other people and have been
// through a model on the way here. React escapes text nodes by default, and the
// test suite proves it with a sentence that tries to open a `<script>`.
//
// The citation is the same surface: a publisher name comes off a feed, which is
// to say it is written by whoever runs the feed, and it is now printed inside a
// link. The escaping test carries a hostile name for that reason as well as a
// hostile sentence.

'use client'

import { Fragment, useRef, useState } from 'react'

import { dayMonth } from '@/lib/date'
import type { Citation, Sentence } from '@/lib/search/answer'
import type {
  AskResult,
  MAX_QUESTIONS as ServerMaxQuestions,
  MAX_QUESTION_CHARS as ServerMaxQuestionChars,
} from '@/lib/search/ask'

/**
 * The two server caps, restated here and tied to their originals by type.
 *
 * `lib/search/ask.ts` is the authority on both, and importing the *values* from
 * it would drag `ai`, `@ai-sdk/anthropic`, `zod` and `minisearch` into the
 * browser bundle for the sake of two integers — this is a Client Component, and
 * every module it imports for a value ships. So the import is `import type`,
 * which is erased entirely, and `typeof` makes the literal type of the server's
 * constant the declared type of ours: change `MAX_QUESTIONS` to 4 over there and
 * `pnpm typecheck` fails here. A copied number that cannot drift is a different
 * thing from a copied number.
 */
const MAX_QUESTIONS: typeof ServerMaxQuestions = 3
const MAX_QUESTION_CHARS: typeof ServerMaxQuestionChars = 300

/** The dialog's id. `AskButton` points `aria-controls` at it. */
export const ASK_PANEL_ID = 'ask'

/**
 * What the panel is showing, one state at a time.
 *
 * The question rides on every member because every state that says anything is
 * a statement about a particular question — including the two that fail, which
 * is what lets the reader's words stay on screen if that is ever wanted.
 */
export type Live =
  | { kind: 'idle' }
  | { kind: 'running'; question: string }
  | { kind: 'answered'; question: string; sentences: Sentence[] }
  | { kind: 'nothing'; question: string; editions: number; from: string }
  | { kind: 'failed'; question: string }
  | { kind: 'limited'; question: string; retryAfter: number }

/**
 * A question that got an answer — the refusal being an answer, and the whole
 * point of the product.
 *
 * The series is made of these, so a question that failed or was rate limited
 * leaves nothing behind: there is no pair to keep on screen, and nothing about
 * it worth telling the model on the next question.
 */
export type Exchange = Extract<Live, { kind: 'answered' | 'nothing' }>

/** The note under the field. It is the one place the software speaks about itself. */
const STANDING =
  'Answers cite the item and the day it ran. If nothing here matches, it says so rather than inventing one.'

/**
 * The note under the field, per state.
 *
 * `running` is the reference's own sentence — *"Reading 2 editions"*, frames 05
 * and 07 — and it needs a number the browser has no way to know. The count is
 * handed down from the server components that already hold it, which is one prop
 * through `AskButton` and no fetch: `EditionPage` and `Archive` both have
 * `listEditionDates()` in hand at render time.
 *
 * The alternative was "Reading the archive", which is honest and is not what was
 * designed. A panel that is never in the visual gate — it is a closed dialog in
 * every screenshot — is exactly the surface where a small divergence survives
 * unnoticed, so it is worth the prop.
 */
function note(live: Live, editions: number): string {
  switch (live.kind) {
    case 'running':
      return editions === 0
        ? 'Reading the archive'
        : `Reading ${editions} edition${editions === 1 ? '' : 's'}`
    case 'failed':
      return 'The search could not run. Try again.'
    case 'limited':
      // The wait comes from the route, in seconds, and is spoken in whole
      // minutes rounded up — a reader told "try again in 43 seconds" will watch
      // a clock, and one told "shortly" learns nothing. Zero means the body did
      // not carry a number, and then the sentence names no time rather than
      // naming a wrong one.
      return live.retryAfter > 0
        ? `Too many questions from here. Try again in about ${Math.ceil(live.retryAfter / 60)} minute` +
            `${Math.ceil(live.retryAfter / 60) === 1 ? '' : 's'}.`
        : 'Too many questions from here. Try again shortly.'
    default:
      return STANDING
  }
}

/**
 * The items one sentence rests on, one citation each.
 *
 * **De-duplicated by id, not by day.** Collapsing on the date was right while
 * `.cite` printed nothing but a day: two items from the same edition produced
 * the identical link twice in a row, which reads as one claim made twice. Now
 * that a citation is a story — an outlet, and a link to the article — two items
 * from the same edition are two different sources, and dropping one would hide a
 * claim's second leg behind the first. The day repeating between them is not a
 * repetition; it is two things that ran on the same morning.
 *
 * The same id twice in one sentence is still one citation. A model that names an
 * item twice has not found a second source for it, and `seen` resolves both
 * copies to the same article — so that case is the identical link in a row, and
 * it is the only one left.
 */
function sources(sentence: Sentence): Citation[] {
  return [...new Map(sentence.cites.map((cite) => [cite.id, cite])).values()]
}

/**
 * The prose of one exchange: the model's sentences, or the refusal.
 *
 * The refusal names *that* rather than the subject the reference's frame 06
 * names — the route returns counts and no subject phrase, and quoting the
 * reader's own question back inside the sentence reads as a machine repeating
 * itself. An archive with no editions in it gets its own clause: "The archive
 * holds 0 editions, from " is not a sentence, and there is no day to name.
 */
function AnswerText({ of }: { of: Exchange }) {
  if (of.kind === 'nothing') {
    return (
      <>
        {of.editions === 0
          ? 'Nothing about that has run in an edition. The archive holds no editions yet.'
          : `Nothing about that has run in an edition. The archive holds ${of.editions} ` +
            `edition${of.editions === 1 ? '' : 's'}, from ${dayMonth(of.from)}.`}
      </>
    )
  }

  return (
    <>
      {of.sentences.map((sentence, n) => (
        <Fragment key={n}>
          {/* One template string, not a sentence beside a space: two adjacent
              text nodes are separated by a `<!-- -->` marker in the streamed
              HTML, and the space would land on the far side of it. The same
              line is in `EditionBar` and in the states catalogue. */}
          {`${n === 0 ? '' : ' '}${sentence.text} `}
          {sources(sentence).map((cite) => (
            // A link, not the reference's `<span>`. `.cite` already has its
            // type and its colour; nothing about it changes to become a link,
            // which is the test that it was designed as one.
            //
            // `<a>` rather than `next/link`: the destination is the publisher's
            // own page and there is no route here to prefetch. `target="_blank"`
            // because leaving the archive to check one claim should not cost the
            // reader the answer they were reading, and `rel` because a tab
            // opened this way can otherwise reach back through `window.opener`.
            //
            // The label is one template string for the reason the sentence above
            // it is: adjacent text nodes are separated by a `<!-- -->` marker in
            // the streamed HTML, and it would land between the outlet and the
            // day.
            <a
              key={cite.id}
              className="cite"
              href={cite.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {`${cite.publisher} · ${dayMonth(cite.date)}`}
            </a>
          ))}
        </Fragment>
      ))}
    </>
  )
}

/**
 * The panel's body, given a state rather than holding one.
 *
 * Exported because it is the only way this suite can see a state at all: the
 * tests render with `renderToStaticMarkup` and the project has no DOM, so a
 * component that could only reach `running` by being clicked would have five of
 * its six states untested. Everything stateful is in `AskPanel` below and is
 * three lines long.
 *
 * The order is the reference's, read top to bottom: what has been answered,
 * then the live line, then the note. The field stands in the live line's slot —
 * one slot holding either the question being asked or the question being
 * answered — which is why the running state has no input in it.
 */
export function AskBody({
  past,
  live,
  onAsk,
  editions,
}: {
  past: readonly Exchange[]
  live: Live
  onAsk: (question: string) => void
  /** How many editions the archive holds, for the reference's running note. */
  editions: number
}) {
  return (
    // `aria-live` so an answer arriving is heard and not only seen. Polite, on
    // the body rather than on the answer, because the thing that changes is
    // which children exist; the cost is that the field's label is read again
    // when the field comes back, which is a fair price for hearing the answer.
    <div className="panel-body" aria-live="polite">
      {past.map((exchange, n) => (
        <div className="ask-past" key={n}>
          <p className="ask-q">{exchange.question}</p>
          <p className="ask-a">
            <AnswerText of={exchange} />
          </p>
        </div>
      ))}

      {live.kind === 'running' ? (
        <div className="ask-line">
          <span className="ask-q">{live.question}</span>
          <span className="ask-bar" />
        </div>
      ) : (
        <>
          {(live.kind === 'answered' || live.kind === 'nothing') && (
            <p className="ask-a">
              <AnswerText of={live} />
            </p>
          )}

          {/* A form, so Enter asks and the phone's keyboard says Go. It is
              uncontrolled: the field unmounts while the question is in flight
              and comes back empty on its own, which is the same clearing a
              controlled value would have needed a state for. */}
          <form
            onSubmit={(event) => {
              event.preventDefault()
              const asked = String(new FormData(event.currentTarget).get('q') ?? '').trim()
              // Both bounds are the server's, checked again here so a question
              // that cannot be answered is not paid for. `maxLength` stops the
              // typing; this stops everything else.
              if (asked !== '' && asked.length <= MAX_QUESTION_CHARS) onAsk(asked)
            }}
          >
            <label className="panel-label" htmlFor="q">
              Ask about anything that has run in an edition.
            </label>
            {/* `autoFocus` for the remount as much as for the open: the field
                is destroyed while the question is in flight, and without this
                the answer arrives with focus on the dialog rather than on the
                place the next question is typed. */}
            <input
              className="panel-input"
              id="q"
              name="q"
              type="text"
              placeholder="What did OpenAI ship this week?"
              autoComplete="off"
              maxLength={MAX_QUESTION_CHARS}
              autoFocus
              aria-describedby="ask-note"
            />
          </form>
        </>
      )}

      <p className="panel-note" id="ask-note">
        {note(live, editions)}
      </p>
    </div>
  )
}

/**
 * The series, one question later: what stays above the new question.
 *
 * The exchange on screen joins the series first — it has just become an earlier
 * question — and then the cap applies. At `MAX_QUESTIONS` the whole series is
 * dropped, which is the fourth question starting clean, and it happens without
 * a word to the reader: the alternative is a line about the software in a panel
 * that is otherwise about the news.
 */
export function carry(past: readonly Exchange[], live: Live): Exchange[] {
  const series = live.kind === 'answered' || live.kind === 'nothing' ? [...past, live] : [...past]
  return series.length >= MAX_QUESTIONS ? [] : series
}

/**
 * The request, and the only thing in this file that leaves the browser.
 *
 * **`previous` is questions and nothing else**, and it is built from
 * `Exchange.question` at the one call site below — an answer has no field to
 * travel in, here or in the route's schema, which is `z.strictObject` for
 * exactly this reason.
 *
 * Nothing throws out of it. A 429 is its own state because the reader is told
 * something specific and true; every other failure — a 400, a 500, a dropped
 * connection, a proxy answering with HTML — is one state, because the sentence
 * the reader gets is the same for all of them and the difference matters in the
 * route's log rather than in the panel.
 */
export async function ask(question: string, previous: readonly string[]): Promise<Live> {
  const failed: Live = { kind: 'failed', question }

  try {
    const response = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question, previous }),
    })

    if (response.status === 429) {
      // The route puts the wait in the body as well as in the header, because
      // reading a response header is not what this function is written to do.
      // Zero is the honest default: a body without it means the panel does not
      // know, and `note` then says so without naming a number.
      const { retryAfter } = (await response.json().catch(() => ({}))) as { retryAfter?: number }
      return { kind: 'limited', question, retryAfter: retryAfter ?? 0 }
    }
    if (!response.ok) return failed

    // The route validated everything about this body before sending it, and it
    // is the only caller this endpoint has. The cast is that fact written down.
    const result = (await response.json()) as AskResult

    if (result.kind === 'answer') return { kind: 'answered', question, sentences: result.sentences }
    if (result.kind === 'nothing') {
      return { kind: 'nothing', question, editions: result.editions, from: result.from }
    }

    return failed
  } catch {
    return failed
  }
}

/**
 * @param ref  the dialog itself, so `AskButton` can call `showModal()` on it.
 *   A ref rather than `document.getElementById`, which is what the reference
 *   does because a static HTML file has no other option.
 */
export function AskPanel({ ref, editions }: { ref: React.Ref<HTMLDialogElement>; editions: number }) {
  const [past, setPast] = useState<readonly Exchange[]>([])
  const [live, setLive] = useState<Live>({ kind: 'idle' })
  // Which question the panel is waiting for. Incremented on every submit and on
  // every close, so an answer that arrives after the reader has closed the panel
  // or reset the series is dropped rather than rendered into a panel that has
  // moved on. There is no abort because the request is already paid for by the
  // time it could be cancelled — this is about what gets shown, not about cost.
  const waiting = useRef(0)

  function submit(question: string) {
    const series = carry(past, live)
    const token = (waiting.current += 1)

    setPast(series)
    setLive({ kind: 'running', question })

    void ask(
      question,
      series.map((exchange) => exchange.question),
    ).then((next) => {
      if (waiting.current === token) setLive(next)
    })
  }

  return (
    <dialog
      className="panel"
      id={ASK_PANEL_ID}
      ref={ref}
      aria-label="Ask this archive"
      // One handler for three ways out — the button, Escape and the backdrop.
      // The panel promises a clean start every time it opens, and this is the
      // whole of that promise.
      onClose={() => {
        waiting.current += 1
        setPast([])
        setLive({ kind: 'idle' })
      }}
    >
      {/* `method="dialog"` closes the dialog on submit with no handler and no
          JavaScript, so the close button works before hydration and would keep
          working if the bundle never arrived. */}
      <form method="dialog" className="panel-head">
        <p className="panel-title">Ask this archive</p>
        <button className="panel-x" aria-label="Close">
          Close
        </button>
      </form>
      <AskBody past={past} live={live} onAsk={submit} editions={editions} />
    </dialog>
  )
}
