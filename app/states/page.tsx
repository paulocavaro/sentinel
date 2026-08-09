// /states — the catalogue of every condition the edition can be in that is not
// an ordinary day.
//
// It exists so those states cannot rot unseen. Four of the seven are reachable
// in production only when something goes wrong — the job fails, the window is
// thin, a day was never written, an item arrives without a picture — which
// means they are the four nobody looks at until the morning they are the only
// thing on the site. Here they are all on one page, at 390 and at 1100, in both
// schemes, and `design-refs/states.html` is the document they are compared
// against.
//
// **The frames are the real components.** `StaleBanner`, `Masthead`,
// `CloseBlock`, `NoEdition` and `Item` are the same imports the two edition
// routes make, so a change to any of them shows up here rather than being
// mirrored into a second set of markup that agrees with the reference and no
// longer with the site. What is hand-written is the catalogue chrome — `.cat`,
// `.state`, `.state-frame` — which belongs to this route alone and to no
// product surface, and the `.panel-static` blocks, which have no component
// behind them yet (see states 05, 06 and 07 below).
//
// The data is `./fixtures`, derived from the two committed editions.

import type { Metadata } from 'next'
import { Fragment, type ReactNode } from 'react'

import { CloseBlock } from '@/app/components/EditionPage'
import { Item } from '@/app/components/Item'
import { Masthead } from '@/app/components/Masthead'
import { NoEdition } from '@/app/components/NoEdition'
import { StaleBanner } from '@/app/components/StaleBanner'

import {
  followUpFixture,
  missingFixture,
  photographFixture,
  staleFixture,
  thinFixture,
} from './fixtures'

export const metadata: Metadata = {
  title: 'States',
  description:
    'Every condition the edition can be in that is not an ordinary day, framed as a catalogue.',
}

/**
 * One framed condition: the number, the name, why it is designed the way it is,
 * and the thing itself.
 *
 * `.state-why` is prose about the design rather than product copy, which is why
 * it is written here in full and not derived from anything. The visual gate
 * compares text, so these seven paragraphs are `design-refs/build-states.mjs`'s,
 * word for word.
 */
function State({
  n,
  title,
  why,
  children,
}: {
  n: string
  title: string
  why: string
  children: ReactNode
}) {
  return (
    <section className="state">
      <div className="state-head">
        <p className="state-n">{n}</p>
        <h2 className="state-title">{title}</h2>
        <p className="state-why">{why}</p>
      </div>
      <div className="state-frame">{children}</div>
    </section>
  )
}

export default async function States() {
  const [stale, thin, photograph, answered] = await Promise.all([
    staleFixture(),
    thinFixture(),
    photographFixture(),
    followUpFixture(),
  ])

  return (
    <div className="cat">
      <p className="cat-title">Sentinel</p>
      {/* The catalogue's own title, borrowing the edition date's face at a size
          that is not an edition's. Inline because it is the one heading on the
          site that is not a date and does not want a token of its own. */}
      <h1 className="editiondate" style={{ fontSize: '2.25rem', margin: '0 0 1rem' }}>
        States
      </h1>
      <p className="cat-lede">
        {"Every condition the edition can be in that is not an ordinary day. Each one is designed, not improvised: the page has to say what happened in plain language, and it must never present stale or partial content as if it were today's."}
      </p>

      <State
        n="01"
        title="Yesterday’s edition, still live"
        why="The job failed, so nothing was written and the previous day stays up. The spec requires this be clearly marked. The banner is the one place the accent is spent on something other than the rank and the end mark, because it is the only genuine emergency the product has."
      >
        {/* No inline padding on the masthead: `.stale-banner + .masthead` in the
            stylesheet is the 1.5rem the reference writes by hand, and it is the
            rule the real page relies on. */}
        <StaleBanner edition={stale.edition} nextRun={stale.nextRun} />
        <Masthead edition={stale.edition} />
      </State>

      <State
        n="02"
        title="A thin day"
        why="Fewer than thirty candidates survived the window. The edition publishes anyway — a thin news day is not a failure — and says the number rather than leaving the reader to count. The end mark carries the real count, so it can never claim thirty on a day that had seventeen."
      >
        <Masthead edition={thin} />
        <CloseBlock edition={thin} />
      </State>

      <State
        n="03"
        title="A day with no edition"
        why="An archive date the pipeline never wrote. Not a 404 — the date is a real day and the reader asked for it by name. It says what is true and offers the nearest thing that exists."
      >
        <NoEdition date={missingFixture.date} dates={missingFixture.dates} />
      </State>

      <State
        n="04"
        title="An item with no photograph"
        why="Roughly a third of items arrive without a usable image. The card is not a card with a hole in it — it is a card whose headline takes the space the picture would have had. The rhythm that produces is different every day and derived entirely from the day’s real data."
      >
        {/* Two columns rather than the grid's four, because the frame is 904px
            wide and the point of the state is the pair. The wrapper is
            catalogue chrome; both cards inside it are `Item`. */}
        <div className="features" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>
          <Item item={photograph.withPhoto} tier="feature" />
          <Item item={photograph.withoutPhoto} tier="feature" />
        </div>
      </State>

      {/* ── States 05, 06 and 07 are the panel, and it is being built. ───────
          There is still no component behind Running, Answered, No result or
          Follow-up: `AskPanel` becomes live at the end of phase 03, and until
          it does these frames are the reference's static markup, held here
          unchanged.
          They are kept rather than dropped because they are the states the
          product's central claim rests on — that it answers from the archive
          and says so when the archive has nothing — and a catalogue that
          silently skipped them would make that claim easy to forget while it is
          being built. When the panel lands, the component replaces this markup
          and `design-refs/build-states.mjs` is regenerated with it.
          05 and 06 still carry a mock of an answer, written before the search
          existed. 07 does not, and no frame written from here on will: its
          sentences come out of a committed edition through `followUpFixture`.
          ──────────────────────────────────────────────────────────────────── */}
      <State
        n="05"
        title="Asking, and being answered"
        why="The panel’s three live states. Running is a rule that fills, not a spinner: a spinner says the software is busy, a rule says the archive is being read. The answer names the day every item ran, because the whole claim is that this is a dated record."
      >
        <div className="panel-static">
          <p className="panel-label">Running</p>
          <div className="ask-line">
            <span className="ask-q">What did OpenAI ship this week?</span>
            <span className="ask-bar" />
          </div>
          <p className="panel-note">Reading 2 editions</p>
        </div>
        <div className="panel-static" style={{ marginTop: '2rem' }}>
          <p className="panel-label">Answered</p>
          <p className="ask-a">
            {'OpenAI paused work on its Astra model after finding it could launch cyberattacks on its own, and it published early cybersecurity evaluations of the same system. '}
            <span className="cite">9 August</span>
            {' It also acquired the presentation startup NextSlide. '}
            <span className="cite">9 August</span>
          </p>
        </div>
      </State>

      <State
        n="06"
        title="Asking about something that is not here"
        why="The most important state in the product. A news product that answers from the model’s own memory is lying about what it holds, and the reader finds out on the first thing they check. It says the limit plainly and offers nothing it cannot support."
      >
        <div className="panel-static">
          <p className="panel-label">No result</p>
          <p className="ask-a">
            {'Nothing about the Formula One season has run in an edition. The archive holds 2 editions, from 8 August.'}
          </p>
        </div>
      </State>

      <State
        n="07"
        title="A question after a question"
        why="A second question is usually a fragment that means nothing on its own, so the pair it follows stays on the page rather than being cleared. The earlier question and its answer step back a tone and sit above a hairline; the live line keeps the full weight of ink, so reading the panel from the top is reading the series in order. Nothing here is new — it is the parts of 05, stacked."
      >
        {/* The two questions are written: they are the product's voice, and a
            follow-up has to be a real fragment — *who is running it now* — for
            the frame to show anything at all. The answer between them is not
            written. It is two descriptions out of the 9 August edition, each
            with the day it ran, exactly as `build-states.mjs` takes them. */}
        <div className="panel-static">
          <p className="panel-label">Follow-up</p>
          <div className="ask-past">
            <p className="ask-q">What is happening at DeepMind?</p>
            <p className="ask-a">
              {answered.map((sentence, n) => (
                <Fragment key={sentence.id}>
                  {`${n === 0 ? '' : ' '}${sentence.text} `}
                  <span className="cite">{sentence.day}</span>
                </Fragment>
              ))}
            </p>
          </div>
          <div className="ask-line">
            <span className="ask-q">Who is running it now?</span>
            <span className="ask-bar" />
          </div>
          <p className="panel-note">Reading 2 editions</p>
        </div>
      </State>
    </div>
  )
}
