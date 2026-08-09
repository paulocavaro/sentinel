// A day with no edition to show. `states.html` 03 and 08.
//
// **Two states, not one.** A day whose file was never written and a day whose
// file is on disk and failed validation both arrive here, and both used to be
// told "nothing ran". For the second that is false in the one way this product
// may never be false: thirty items are sitting in `content/days/` and the page
// is denying its own record. It is not exotic either — a merge conflict in a
// committed edition does it, and so does any change to the shape of a published
// field. `lib/edition.ts` now says which of the two happened, and the only job
// left here is to not claim more than that.
//
// What the unreadable copy may say is what is observable from here: there is a
// file for the day, and it could not be read as an edition. **It may not name a
// cause.** "Corrupted", "the job failed", "the file is damaged" are all guesses
// — the load knows that `toEdition` refused and nothing whatever about why —
// and a guess printed in the masthead is the same failure as the sentence it
// replaced, one degree quieter.
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
 * The two lines that differ between the states. Everything else on the page —
 * the masthead, the neighbours, the way back — is the same page either way,
 * because the reader's situation is the same either way: they asked for a day
 * and there is no edition to give them.
 *
 * Written as data rather than as two branches in the markup so the difference
 * between the states is one place to read and one place to change, and so a
 * later state cannot be added by tacking a ternary onto a ternary.
 */
const COPY = {
  absent: {
    promise: 'No edition',
    manifest: (day: string) =>
      `Nothing ran on ${day}. The job did not complete, and an edition is never written after the fact.`,
  },
  unreadable: {
    promise: 'Unreadable edition',
    manifest: (day: string) =>
      `There is a file for ${day}, and it could not be read. The day is in the archive; what that file holds is not an edition this page can print.`,
  },
} as const

/**
 * @param date   the day that was asked for. A calendar date, already validated
 *   by the route.
 * @param dates  every date the archive can render — `listEditionDates()`.
 * @param record which of the two states this is — `lib/edition.ts`'s, minus the
 *   `edition` case, which is not this component's page. Required rather than
 *   defaulted to `absent`: the default would be the honest sentence exactly
 *   until someone adds a third caller, and the failure mode of getting it wrong
 *   is the page lying about the archive.
 */
export function NoEdition({
  date,
  dates,
  record,
}: {
  date: string
  dates: readonly string[]
  record: 'absent' | 'unreadable'
}) {
  const { prev, next } = neighbours(date, dates)
  const copy = COPY[record]

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
        <p className="promise">{copy.promise}</p>
        {/* `.manifest` is italic because it usually carries the model's
            editorial line. This sentence is the product speaking, so it stands
            upright — the same override `states.html` 03 and `not-found.tsx`
            make on the same element. */}
        <p className="manifest" style={{ fontStyle: 'normal' }}>
          {copy.manifest(dayMonth(date))}
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
