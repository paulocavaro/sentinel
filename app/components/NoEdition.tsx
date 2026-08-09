// A day the pipeline never wrote. `states.html` 03.
//
// **This is not a 404.** A 404 is an address that was never part of the site;
// this is a real date inside the archive's own range, asked for by name, that
// has no edition behind it because the run aborted below MIN_ITEMS or simply
// failed. `app/not-found.tsx` says "no such page"; this page says what happened
// on the day you asked about. Answering with a 404 would tell a reader their
// link was wrong when it was the pipeline that was quiet.
//
// It is deliberately the masthead and nothing else — no chip row, no items, no
// closing mark, no ask button. There is nothing to filter, nothing to end, and
// the fab's label is "Ask this archive": the two pages that carry it are pages
// the archive actually has content on. The reference frames this state as a
// masthead and three links and it is right to.
//
// Two departures from the reference's markup, both to agree with the components
// already shipped beside this one:
//
//   · The nav sits in `<div class="editionbar">` rather than carrying an inline
//     `margin-top: 1.25rem`. `.editionbar`'s entire job is the spacing under a
//     masthead, `app/not-found.tsx` already does exactly this, and the reference
//     value is a hand-written approximation of the token — 4px apart. Whoever
//     builds `/states` should expect that difference and fix it in
//     `build-states.mjs`, not here.
//   · Prev and next are the nearest editions that *exist*, not ±1 day. The
//     reference prints the calendar neighbours because it is one hand-written
//     frame with no archive behind it; a real one would offer the reader two
//     more empty days from a page whose entire message is that this day is
//     empty. `neighbours()` is the edition bar's, so the two navs on the site
//     cannot disagree about what a neighbour is.
//
// A NoEdition page can only be reached for a date inside `[earliest, latest]`
// — `app/day/[date]/page.tsx` bounds it — and both endpoints of that range are
// editions, so `prev` and `next` are in practice never null here. The `is-off`
// branch is kept anyway: it costs two lines, it is the same treatment the
// edition bar gives an unavailable direction, and it is what stops this
// component from being the thing that throws if that invariant ever moves.

import Link from 'next/link'

import { dayMonth, editionDate, shiftDays } from '@/lib/date'

import { neighbours } from './EditionBar'

/**
 * @param date   the day that was asked for. A calendar date, already validated
 *   by the route.
 * @param dates  every date the archive can render — `listEditionDates()`.
 */
export function NoEdition({ date, dates }: { date: string; dates: readonly string[] }) {
  const { prev, next } = neighbours(date, dates)

  return (
    <div className="page">
      <header className="masthead">
        <p className="wordmark">Sentinel</p>
        {/* No `.weekday` span, so the whole date is full ink. That is the
            reference's treatment for this state and not an oversight of it: on
            an edition page the weekday recedes because the edition is the
            subject and the date labels it, and here the date *is* the subject —
            it is the only fact the page has. */}
        <h1 className="editiondate">{editionDate(date)}</h1>
        <p className="promise">No edition</p>
        {/* `.manifest` is italic because it usually carries the model's
            editorial line. This sentence is the product speaking, so it stands
            upright — the same override `states.html` 03 and `not-found.tsx`
            make on the same element. */}
        <p className="manifest" style={{ fontStyle: 'normal' }}>
          {`Nothing ran on ${dayMonth(date)}. The job did not complete, and an edition is never written after the fact.`}
        </p>
        <div className="editionbar">
          <nav className="days" aria-label="Editions">
            {prev ? (
              // One template string rather than a glyph beside an expression:
              // two adjacent text nodes are separated by a `<!-- -->` marker in
              // the streamed HTML and the arrow would land on the far side of
              // it. Same as `EditionBar`.
              <Link className="day" href={`/day/${prev}`} rel="prev">{`← ${dayMonth(prev)}`}</Link>
            ) : (
              <a className="day is-off" aria-disabled="true">
                {dayMonth(shiftDays(date, -1))}
              </a>
            )}

            {next ? (
              <Link className="day" href={`/day/${next}`} rel="next">{`${dayMonth(next)} →`}</Link>
            ) : (
              <a className="day is-off" aria-disabled="true">
                {dayMonth(shiftDays(date, 1))}
              </a>
            )}

            <Link className="day day-all" href="/">
              Latest edition
            </Link>
          </nav>
        </div>
      </header>
    </div>
  )
}
