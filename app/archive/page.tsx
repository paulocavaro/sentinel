// Every edition there has been, grouped by month.
//
// **This screen has no design reference**, so what it is made of is an argument
// rather than a comparison. The rule it follows: invent nothing. Every class on
// this page already exists in `app/globals.css` and already means what it is
// being used for here.
//
//   · `.masthead` / `.wordmark` / `.editiondate` / `.promise` / `.manifest` —
//     the page identifies itself the way every other page on the site does. The
//     slot that holds an edition's date holds the word for what this list is.
//   · `.section` + `.section-name` per month. `--rule-strong` "opens a
//     section", and a month is exactly a section of the archive. The same
//     ladder as the front page, one rung down.
//   · `.editionbar` + `.days` + `.day` for the dates themselves. This is the
//     archive's own vocabulary, written down in the stylesheet's comment on
//     `.editionbar`: dates, never Previous and Next. A month is a wrapped row
//     of them at the same size, tracking and case the edition bar uses, so a
//     reader who has used the bar under a masthead already knows what these
//     are. `.editionbar` is also where the 1.5rem under a heading lives, so the
//     spacing is a token and not a number typed here.
//
// **No calendar widget.** A grid of weeks would put six empty cells on the page
// for every real one in the first month and would have to invent a treatment
// for "no edition" in the one place the product has nothing to say — and it
// would be the first thing in this design that is a picture of a month rather
// than a list of days. The dates are links, in order, newest first.
//
// Two things it deliberately does not do. It does not list the gap days, even
// though `/day/[date]` renders a page for each of them: this is the index of
// what Sentinel has published, and a link to a day that ran nothing is not an
// entry, it is a footnote — the edition bar and `NoEdition` are where a reader
// meets those days, arriving from a date they had a reason to ask about. And it
// carries `AskButton`, which no other secondary page does: the fab's label is
// "Ask this archive", and this is the archive.

import type { Metadata } from 'next'
import Link from 'next/link'

import { AskButton } from '@/app/components/AskButton'
import { dayMonth, monthYear } from '@/lib/date'
import { listEditionDates } from '@/lib/edition'
import { CLOSING_TIME } from '@/lib/ingest/config'

export const metadata: Metadata = {
  title: 'All editions',
  description: 'Every edition Sentinel has published, by month.',
}

type Month = { key: string; label: string; dates: string[] }

/**
 * The dates grouped by the month they fall in, newest month first and newest
 * date first inside it — the order `listEditionDates()` already hands back, so
 * nothing is sorted twice and the page cannot disagree with the edition bar
 * about which way the archive runs.
 *
 * The key is the `YYYY-MM` prefix and the label comes from `lib/date.ts`, which
 * is the module that knows a calendar date is not an instant. Grouping on the
 * *label* would work by accident and merge two Augusts a year apart.
 */
function byMonth(dates: readonly string[]): Month[] {
  const months: Month[] = []

  for (const date of dates) {
    const key = date.slice(0, 7)
    const last = months.at(-1)

    if (last?.key === key) last.dates.push(date)
    else months.push({ key, label: monthYear(date), dates: [date] })
  }

  return months
}

export default async function Archive() {
  const dates = await listEditionDates()
  const months = byMonth(dates)

  // A fresh clone, or this repository between its first commit and its first
  // successful ingest. The same sentence `app/page.tsx` says, because it is the
  // same fact — and the masthead is the only part of this page that has
  // anything to render.
  if (months.length === 0) {
    return (
      <div className="page">
        <header className="masthead">
          <p className="wordmark">Sentinel</p>
          <h1 className="editiondate">No editions yet</h1>
          <p className="manifest" style={{ fontStyle: 'normal' }}>
            {`Sentinel publishes one edition a morning, closed at ${CLOSING_TIME}. The first one has not run yet.`}
          </p>
          <p className="promise">Nothing published</p>
        </header>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="masthead">
        <p className="wordmark">Sentinel</p>
        <h1 className="editiondate">All editions</h1>
        <p className="manifest" style={{ fontStyle: 'normal' }}>
          {`One edition a morning, closed at ${CLOSING_TIME}. Days that ran nothing are not listed — an edition is never written after the fact.`}
        </p>
        {/* Machine face, like every `.promise`: the count, and the span the
            archive covers. `dates` is newest first, so the range reads from its
            last entry to its first. */}
        <p className="promise">
          {`${dates.length} ${dates.length === 1 ? 'edition' : 'editions'} · ${dayMonth(dates[dates.length - 1])} – ${dayMonth(dates[0])}`}
        </p>
        <div className="editionbar">
          <nav className="days" aria-label="Editions">
            <Link className="day day-all" href="/">
              Latest edition
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {months.map((month) => (
          <section className="section" key={month.key} aria-labelledby={`${month.key}-name`}>
            <h2 className="section-name" id={`${month.key}-name`}>
              {month.label}
            </h2>
            {/* Labelled by its own heading rather than by a repeated string:
                the nav landmarks are then named "August 2026", "July 2026" in a
                screen reader's landmark list, which is the only useful thing to
                call them. */}
            <div className="editionbar">
              <nav className="days" aria-labelledby={`${month.key}-name`}>
                {month.dates.map((date) => (
                  <Link className="day" key={date} href={`/day/${date}`}>
                    {dayMonth(date)}
                  </Link>
                ))}
              </nav>
            </div>
          </section>
        ))}
      </main>

      <AskButton editions={dates.length} />
    </div>
  )
}
