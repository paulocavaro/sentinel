// Edition dates.
//
// An edition date is a calendar day — the string the pipeline named the file
// after — and never an instant. `new Date('2026-08-09')` is midnight UTC, so
// every reader west of Greenwich is shown the day before; on this machine, in
// America/Recife, that reads "Saturday 8 August" for Sunday's edition.
//
// Two defences, and both are needed:
//
//   1. Parse at noon UTC, which is what design-refs/build-home.mjs does. It
//      puts the instant twelve hours from either midnight.
//   2. Format with an explicit `timeZone: 'UTC'`, so the machine's zone is not
//      consulted at all.
//
// Noon alone leaves a hole: offsets run from UTC−12 to UTC+14, and at UTC+14
// (Pacific/Kiritimati) noon UTC is already the next day. The generator has that
// hole; this module does not, and the two agree everywhere else, so the visual
// gate still compares like with like.
//
// Nothing here reads the machine's timezone, so a page prerendered on a UTC
// build machine says the same date to every reader.

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Whether the string names a day that exists.
 *
 * **The shape test is not the calendar test, and the difference had teeth.**
 * `2026-02-29` matches the regex, and `new Date('2026-02-29T12:00:00Z')` does
 * not return NaN — it rolls forward to 1 March. So a shape-only check let a
 * filename that names no day through, and every date function then printed the
 * rolled day: an edition committed as `2026-02-29.json` put "Sunday 1 March" in
 * the masthead, in the largest type on the page, while `/archive` published a
 * link to `/day/2026-02-29` that the route answered with a 404.
 *
 * It survived because the predicate existed twice — the shape here and in
 * `lib/edition.ts`, the round trip in `app/day/[date]/page.tsx` forty lines from
 * a comment explaining why the round trip is needed. One rule, written once, is
 * the whole fix.
 *
 * Exported because two callers need an answer rather than a throw: the archive
 * reader skips an unreadable name, and the route 404s it.
 */
export function isCalendarDate(value: string): boolean {
  if (!CALENDAR_DATE.test(value)) return false

  const parsed = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function atNoonUTC(date: string): Date {
  if (!isCalendarDate(date)) {
    throw new TypeError(`not a calendar date: ${date}`)
  }
  return new Date(`${date}T12:00:00Z`)
}

// Not cached in module scope: a formatter built once would freeze whatever
// resolved options it was created with, and the tests move the process
// timezone under it deliberately.
function format(date: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...options }).format(atNoonUTC(date))
}

// The year is dropped for the current year and printed otherwise. Same reason a
// newspaper's masthead does it: within the year the year is noise, and outside
// it its absence is a lie. "Current" is measured in UTC, like everything else
// here, so the answer does not depend on where the build ran.
function needsYear(date: string, now: Date): boolean {
  return Number(date.slice(0, 4)) !== now.getUTCFullYear()
}

/** `Sunday`. The masthead sets the weekday in its own span. */
export function weekdayOf(date: string): string {
  return format(date, { weekday: 'long' })
}

/** `9 August`, or `31 December 2025`. The edition bar's short form. */
export function dayMonth(date: string, now: Date = new Date()): string {
  return format(date, {
    day: 'numeric',
    month: 'long',
    ...(needsYear(date, now) ? { year: 'numeric' } : {}),
  })
}

/** `Sunday 9 August`, or `Wednesday 31 December 2025`. */
export function editionDate(date: string, now: Date = new Date()): string {
  return `${weekdayOf(date)} ${dayMonth(date, now)}`
}

/**
 * `August 2026`. The archive index's month headings.
 *
 * Here rather than in `app/archive/page.tsx` because the noon-UTC parse and the
 * explicit `timeZone: 'UTC'` are the whole subject of this module: a month
 * formatted from a bare `new Date('2026-09-01')` reads *August* everywhere west
 * of Greenwich, which is the same off-by-one as the edition date and one heading
 * further from anyone noticing. The year is always printed — a month heading in
 * a list that will eventually span years is not a place to economise.
 */
export function monthYear(date: string): string {
  return format(date, { month: 'long', year: 'numeric' })
}

/**
 * The calendar neighbour, as a date string. The edition bar prints it when no
 * edition exists in that direction — present, not offered. Done in UTC so a
 * daylight-saving day, which is 23 or 25 hours long locally, is still one day.
 */
export function shiftDays(date: string, days: number): string {
  const d = atNoonUTC(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
