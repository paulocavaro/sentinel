// One day of the archive, by name.
//
// Everything below the reads is `EditionPage`, the same component `/` renders.
// The difference between the front page and an archive day is which edition and
// whether the page is meant to be current: `/` passes the build's UTC date so
// the stale banner can fall out of the data, and this route passes null,
// because a day asked for by name is never stale — it is simply that day.
//
// ─── dynamicParams, and why it is false ─────────────────────────────────────
//
// `dynamicParams` defaults to true, which means every URL under `/day/` that
// `generateStaticParams` did not produce renders this server component at
// request time: `/day/banana`, `/day/2026-02-30`, `/day/../../etc/passwd` and
// an unbounded tail of crawler noise, each one a function invocation on a site
// whose entire claim is that it is a static dated record. A regex in the body
// can turn those into 404s, but then the regex is the only thing standing
// between the open internet and a render, and it has to be right forever.
//
// The other half of the decision is `NoEdition`. A real day the pipeline never
// wrote has to render something, and that something is a page — which means
// either dynamic params (render it on demand, for any date that survives
// validation) or generating the gap days at build time alongside the real ones.
//
// **This route generates the gaps.** `generateStaticParams` returns every
// calendar date from the earliest edition to the latest, inclusive, so the set
// of URLs the site answers to is exactly the set of days the product has
// existed — a fact about the archive rather than a rule about strings — and
// `dynamicParams = false` makes Next 404 everything else before any code here
// runs. Nothing under `/day/` ever renders at request time, the validation
// below becomes a second lock rather than the only one, and a date outside the
// range (tomorrow, 1999) is honestly a 404: it is not a day Sentinel has
// reached, so it is not an archive day at all.
//
// What that costs, written down: one trivial prerendered page per calendar day
// the archive spans, so a year-old archive builds ~365 pages of which the gaps
// are a masthead and three links. That is the price, it is paid at build, and
// it is the same order as the editions themselves. It is only correct because
// an edition is never written after the fact — the gap pages state exactly what
// `states.html` 03 states, and no later run can turn one of them into a real
// day behind the build's back.

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { EditionPage } from '@/app/components/EditionPage'
import { NoEdition } from '@/app/components/NoEdition'
import { editionDate, isCalendarDate, shiftDays } from '@/lib/date'
import { listEditionDates, readEditionRecord } from '@/lib/edition'

/**
 * Every calendar date the archive spans, oldest first — the real editions and
 * the days between them.
 *
 * `dates` is `listEditionDates()`, newest first, so the last entry is the
 * earliest edition and the first is the latest. Both endpoints are editions by
 * construction, which is why a gap day always has a real edition on either side
 * of it and `NoEdition` always has two neighbours to offer.
 *
 * Walked with `shiftDays`, which does the arithmetic in UTC, rather than by
 * adding 86_400_000 to a timestamp: a daylight-saving day is 23 or 25 hours
 * long locally and the naive walk drifts a day per year of archive.
 */
function archiveRange(dates: readonly string[]): string[] {
  const earliest = dates.at(-1)
  const latest = dates.at(0)
  if (earliest === undefined || latest === undefined) return []

  const range: string[] = []
  for (let day = earliest; day <= latest; day = shiftDays(day, 1)) {
    range.push(day)
  }
  return range
}

/**
 * Only the days in the range are pages; everything else is a 404, decided by
 * the router rather than by this file. See the block at the top.
 */
export const dynamicParams = false

export async function generateStaticParams() {
  return archiveRange(await listEditionDates()).map((date) => ({ date }))
}

/**
 * The title is the edition's date, and the layout's template appends the
 * wordmark: `Saturday 8 August — Sentinel`. Unlike `app/page.tsx` this is a
 * real child segment, so the template applies and `absolute` would be wrong.
 *
 * Both readers are `React.cache`-wrapped, so this and the page below read
 * `content/days` once between them.
 *
 * The three titles are the page's three states, and the tab is a place the
 * "nothing ran" lie is just as reachable as the masthead — a bookmark, a search
 * result and a browser history entry all carry it, and all three outlive the
 * render.
 */
const TITLE = {
  absent: (date: string) => `No edition, ${editionDate(date)}`,
  unreadable: (date: string) => `Unreadable edition, ${editionDate(date)}`,
  edition: (date: string) => editionDate(date),
} as const

export async function generateMetadata({ params }: PageProps<'/day/[date]'>): Promise<Metadata> {
  const { date } = await params
  if (!isCalendarDate(date)) return {}

  const record = await readEditionRecord(date)
  return { title: TITLE[record.state](date) }
}

export default async function Day({ params }: PageProps<'/day/[date]'>) {
  const { date } = await params
  const dates = await listEditionDates()

  // Unreachable while `dynamicParams` is false — the router has already
  // rejected anything `generateStaticParams` did not produce. Kept because the
  // day someone flips that flag for an unrelated reason, this is the difference
  // between a 404 and an unbounded surface, and because `date` reaches a path
  // join two calls later.
  if (!isCalendarDate(date) || !archiveRange(dates).includes(date)) notFound()

  const record = await readEditionRecord(date)

  // A real day with no edition to show, in either of the two ways that happens.
  // Not `notFound()`: see `NoEdition`, which is also where the difference
  // between the two is spent — the day was never written, or the day is on disk
  // and could not be read, and the page says which.
  if (record.state !== 'edition') {
    return <NoEdition date={date} dates={dates} record={record.state} />
  }

  // `today` is null, so no stale banner: an archive day is not out of date, it
  // is the date. See `EditionPage`'s parameter documentation.
  return <EditionPage edition={record.edition} dates={dates} today={null} />
}
