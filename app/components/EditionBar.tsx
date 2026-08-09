// The edition bar: which day you are reading, and the only control the product
// has.
//
// The slots are dates, never the words Previous and Next. Under a date those
// two are ambiguous in a way a date is not — later in time, or further back
// into the archive? — and the stylesheet's comment on `.editionbar` says so.
//
// **Prev and next are the nearest editions that exist, not the calendar
// neighbours.** The pipeline is designed to miss days: it aborts below
// MIN_ITEMS and it can simply fail, and `content/days` is the record of what it
// actually wrote. Stepping ±1 day unconditionally would send half the bar's
// links at dates the archive never wrote, i.e. at `NoEdition`. So the bar is
// given every date there is and finds its own neighbours in it.
//
// When a direction has no edition at all, the slot still shows the calendar
// neighbour's date — present, not offered. It recedes by losing the two marks
// that say a date can be reached: the arrow, which is markup and lives here,
// and the hairline, which is `.day.is-off` in the stylesheet. It does **not**
// recede by opacity: that was the reference's first answer and it composited
// --machine to 1.84:1, below AA, by the one mechanism the system forbids.
//
// It is an `<a>` with no `href` and `aria-disabled="true"`, not a `<span>`.
// A span carrying aria-disabled announces nothing at all — the attribute is
// ignored on a role that has no disabled state — where the anchor is at least
// reached and described.

import Link from 'next/link'

import { dayMonth, shiftDays } from '@/lib/date'

/**
 * The nearest edition either side of `date`.
 *
 * `dates` is every date the archive can render — `listEditionDates()`, which
 * hands them back newest first. Sorted here rather than trusted, because ISO
 * dates sort chronologically either way and a bar that silently reverses when
 * its caller changes order would be a very quiet bug.
 *
 * `date` itself need not be in the list: `/day/2026-08-07` for a day the
 * pipeline never wrote still gets a bar, and both its neighbours are real.
 */
export function neighbours(
  date: string,
  dates: readonly string[],
): { prev: string | null; next: string | null } {
  const sorted = [...dates].sort()
  return {
    prev: sorted.filter((d) => d < date).pop() ?? null,
    next: sorted.find((d) => d > date) ?? null,
  }
}

/**
 * @param home  whether this bar is on `/`. The home route is already the latest
 *   edition, so offering "Latest edition" there would be a link to the page the
 *   reader is on. Everywhere else it is the only way back: the day route
 *   otherwise reaches `/` through `/archive`, two clicks for the most common
 *   destination on the site, and the pre-theme edition has no chip row to put a
 *   control in — which is why this belongs in the bar and not among the chips.
 */
export function EditionBar({
  date,
  dates,
  home,
}: {
  date: string
  dates: readonly string[]
  home: boolean
}) {
  const { prev, next } = neighbours(date, dates)

  return (
    <div className="editionbar">
      <nav className="days" aria-label="Editions">
        {prev ? (
          // One template string, not an arrow glyph beside an expression: two
          // adjacent text nodes are separated by a `<!-- -->` marker in the
          // streamed HTML, and the arrow would land on the far side of it.
          <Link className="day" href={`/day/${prev}`} rel="prev">{`← ${dayMonth(prev)}`}</Link>
        ) : (
          <a className="day is-off" aria-disabled="true">
            {dayMonth(shiftDays(date, -1))}
          </a>
        )}

        <span className="day is-current" aria-current="date">
          {dayMonth(date)}
        </span>

        {next ? (
          <Link className="day" href={`/day/${next}`} rel="next">{`${dayMonth(next)} →`}</Link>
        ) : (
          <a className="day is-off" aria-disabled="true">
            {dayMonth(shiftDays(date, 1))}
          </a>
        )}

        {home ? null : (
          <Link className="day day-all" href="/">
            Latest edition
          </Link>
        )}

        <Link className="day day-all" href="/archive">
          All editions
        </Link>
      </nav>
    </div>
  )
}
