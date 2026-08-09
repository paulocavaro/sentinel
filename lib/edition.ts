// The archive, read from the page's side.
//
// `lib/ingest/archive.ts` is the only module that *writes* here, and it reads
// the same directory for its own purpose — every id and title ever published,
// to keep a story from running twice. This module is the other direction: it
// hands whole editions to server components, and it is deliberately not part of
// the pipeline. The conventions are that file's, though, and on purpose:
//
//   - the same forgiveness on the way in. An unreadable file is skipped, not
//     thrown. There it means one repeated story; here it means one missing day
//     instead of a site that will not build.
//   - the same whole-archive read. A few kilobytes per edition, read at build
//     time. An index would be a second source of truth that can fall out of
//     step with the files actually committed.
//   - `dir` as an argument with a real default, so tests never touch
//     `content/days/` and the two committed editions are not load-bearing.
//
// Both conventions still hold. What changed is that the two ways of failing
// used to be **one answer**: a day with no file and a day whose file failed
// validation both came back as null, and `NoEdition` then told the reader
// nothing ran on a day with thirty items sitting on disk. An ordinary merge
// conflict in a committed edition is enough to reach it, and so is any change
// to the shape of a published field. Forgiveness is still the rule — this
// module does not throw at a damaged file — but the load now answers with which
// of the two happened, so a caller that has a reader in front of it can say the
// true thing. `readEdition` keeps its `Edition | null`, because most callers
// (the search corpus, the states fixtures) only ever want the edition.
//
// What is different is the type. The pipeline's `Item.theme` is required — it
// has been since the field was added — but `content/days/2026-08-08.json` was
// written before it existed and has twenty items with no theme at all. That
// edition is not going to be backfilled, so the reader's item type makes the
// field optional. A type that claimed otherwise would move the failure from
// here, where it can be handled once, into whichever component first read
// `item.theme.length`.

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { cache } from 'react'

import { isCalendarDate } from './date'
import { CONTENT_DIR } from './ingest/config'
import { THEMES } from './ingest/types'
import type { Edition as PublishedEdition, Item as PublishedItem, Theme } from './ingest/types'

/** A published item as the page reads it: everything, minus the theme guarantee. */
export type EditionItem = Omit<PublishedItem, 'theme'> & { theme?: Theme }

/** An edition as the page reads it. */
export type Edition = Omit<PublishedEdition, 'items'> & { items: EditionItem[] }

/**
 * What a date actually has behind it: nothing, something that is not an
 * edition, or an edition.
 *
 * The three are one type because they are one question asked once, and because
 * the difference between the first two is a difference the reader can see.
 * `absent` is an ordinary designed outcome — the pipeline never wrote that day.
 * `unreadable` is a file on disk that `toEdition` refused: a merge conflict in
 * a committed edition, a published field that changed shape, one bad item under
 * the whole-file-or-nothing rule below. Collapsing them is how the page ends up
 * saying "nothing ran" over a day the archive is holding.
 */
export type EditionRecord =
  | { state: 'absent' }
  | { state: 'unreadable' }
  | { state: 'edition'; edition: Edition }

/** Editions are named by the UTC date they cover. `archive.ts` writes the name. */
const EDITION_FILE = /^(\d{4}-\d{2}-\d{2})\.json$/

/**
 * Resolved per call rather than at import, because `process.cwd()` at module
 * scope freezes whatever directory the process happened to start in.
 */
function editionsDir(): string {
  return join(process.cwd(), CONTENT_DIR)
}

function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value)
}

/**
 * One item, as it survives a round trip through untrusted JSON.
 *
 * Every field the card renders is checked, because the alternative is a cast
 * and `undefined` reaching the DOM as the string "undefined". `theme` is the
 * one field allowed to be absent; a theme present but not one of the five is
 * dropped to absent rather than failing the item, which costs the item its
 * section and keeps it on the page.
 */
function readableItem(value: unknown): EditionItem | null {
  if (typeof value !== 'object' || value === null) return null

  const raw = value as Record<string, unknown>
  const { id, rank, title, description, url, publisher, publishedAt, image, feed, topics, theme } =
    raw

  if (typeof id !== 'string') return null
  if (typeof rank !== 'number') return null
  if (typeof title !== 'string') return null
  if (typeof description !== 'string') return null
  if (typeof url !== 'string') return null
  if (typeof publisher !== 'string') return null
  if (typeof publishedAt !== 'string') return null
  if (image !== null && typeof image !== 'string') return null

  if (typeof feed !== 'object' || feed === null) return null
  const { name, kind } = feed as Record<string, unknown>
  if (typeof name !== 'string' || typeof kind !== 'string') return null

  if (!Array.isArray(topics) || topics.some((topic) => typeof topic !== 'string')) return null

  return {
    id,
    rank,
    title,
    description,
    url,
    publisher,
    publishedAt,
    image,
    feed: { name, kind: kind as PublishedItem['feed']['kind'] },
    topics: topics as string[],
    ...(isTheme(theme) ? { theme } : {}),
  }
}

/**
 * One edition, or null if the file on disk is not one.
 *
 * `date` must match the name the file was found under. The name is the URL —
 * `/day/2026-08-08` — so a record answering to two dates would print one of
 * them in the masthead and link to the other from its own edition bar.
 *
 * An edition with no readable items is treated as corrupt rather than rendered:
 * the run aborts below `MIN_ITEMS`, so an empty `items` array on disk is not a
 * quiet day, and rendering it would produce a masthead, nothing, and a closing
 * mark counting to zero.
 */
function toEdition(value: unknown, date: string): Edition | null {
  if (typeof value !== 'object' || value === null) return null

  const { date: own, generatedAt, summary, targetCount, items } = value as Record<string, unknown>

  if (own !== date) return null
  if (typeof generatedAt !== 'string') return null
  if (typeof summary !== 'string') return null
  if (typeof targetCount !== 'number') return null
  if (!Array.isArray(items)) return null

  const readable = items
    .map(readableItem)
    .filter((item): item is EditionItem => item !== null)

  if (readable.length === 0) return null

  // Whole file or nothing, the same rule every malformation above takes. A
  // partial drop is the one failure here that lies rather than breaks: thirty
  // items minus one unreadable renders twenty-nine, and the masthead then
  // asserts an editorial fact that is false — "29 items · a thin day", with a
  // closing sentence about a thin window. The window was fine; the file is
  // damaged. Losing the day to NoEdition is the honest outcome, and a partially
  // corrupt edition is a pipeline bug that should be loud.
  if (readable.length !== items.length) return null

  return { date, generatedAt, summary, targetCount, items: readable }
}

const ABSENT: EditionRecord = { state: 'absent' }
const UNREADABLE: EditionRecord = { state: 'unreadable' }

/** Whether the read failed because there is nothing there, as opposed to failing. */
function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  )
}

async function loadEdition(dir: string, date: string): Promise<EditionRecord> {
  // Not `unreadable`: a string that is not a calendar day has no day behind it
  // to hold a record, so there is nothing for the archive to be holding. It also
  // must not become a path — the disk is never touched here. `2026-02-29.json`
  // is the case with teeth: the file exists, and the day does not.
  if (!isCalendarDate(date)) return ABSENT

  let raw: string
  try {
    raw = await readFile(join(dir, `${date}.json`), 'utf8')
  } catch (error) {
    // No file for that day. On a route this is `NoEdition`, not a 404 and not
    // a build failure. Only ENOENT means that, though: a permission error or a
    // directory sitting where the file should be is a day the archive has and
    // cannot open, which is the reader's `unreadable`, not its `absent`.
    return isMissing(error) ? ABSENT : UNREADABLE
  }

  // Everything past the read is the file failing to be an edition, whether it
  // failed as JSON or failed validation. The reader is told the same thing
  // either way, because the same thing is true either way — the day has a
  // record here and it could not be read.
  try {
    const edition = toEdition(JSON.parse(raw), date)
    return edition === null ? UNREADABLE : { state: 'edition', edition }
  } catch {
    return UNREADABLE
  }
}

/**
 * Every date the archive can actually render, newest first.
 *
 * Dates are ISO, so lexicographic order is chronological order.
 *
 * **Each file is read and parsed, not merely named.** This drives
 * `generateStaticParams` and the archive index; a date listed from a filename
 * alone whose contents are corrupt would prerender a route that renders
 * nothing, and `readLatestEdition` would answer null with a perfectly good
 * edition sitting one day behind it.
 */
export const listEditionDates = cache(async (dir: string = editionsDir()): Promise<string[]> => {
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    // No archive yet: a fresh clone, before the first ingest.
    return []
  }

  const dates = entries
    .map((entry) => entry.match(EDITION_FILE)?.[1])
    .filter((date): date is string => date !== undefined)
    .sort()
    .reverse()

  const readable = await Promise.all(
    dates.map(async (date) => ((await loadEdition(dir, date)).state === 'edition' ? date : null)),
  )

  return readable.filter((date): date is string => date !== null)
})

/**
 * What one date has behind it, told apart.
 *
 * For the one caller that renders the answer to a reader. `/day/[date]` prints
 * a different sentence for `absent` than for `unreadable`, and it is the only
 * surface that can: it is the page a reader lands on when they ask for a day by
 * name.
 *
 * `date` arrives from a route segment, so it is matched against a calendar
 * shape before it is allowed to become a path. Task 10 validates the segment
 * too; this is the copy that is next to the `join`.
 */
export const readEditionRecord = cache(
  async (date: string, dir: string = editionsDir()): Promise<EditionRecord> =>
    loadEdition(dir, date),
)

/**
 * One edition by date, or null when there is no readable file for it.
 *
 * Both failures are null here, deliberately: the corpus builder and the states
 * fixtures want an edition or nothing, and a caller with no reader in front of
 * it has no use for the distinction. It goes through `readEditionRecord` rather
 * than around it so a route that asks both questions still reads the file once
 * — `cache` keys on the argument list, and both calls pass the same one.
 */
export const readEdition = cache(async (date: string, dir?: string): Promise<Edition | null> => {
  const record = await readEditionRecord(date, dir ?? editionsDir())
  return record.state === 'edition' ? record.edition : null
})

/**
 * The newest readable edition, or null.
 *
 * **Null is reachable**, not defensive: a fresh clone has no `content/days` at
 * all, and neither does the repository between its first commit and its first
 * successful ingest. The home route renders `NoEdition` for it.
 */
export const readLatestEdition = cache(
  async (dir: string = editionsDir()): Promise<Edition | null> => {
    const [latest] = await listEditionDates(dir)
    if (latest === undefined) return null

    // `listEditionDates` has already parsed this file to decide it is readable,
    // so the record is an edition here in every case but a file changed between
    // the two reads. Null rather than a throw for it, the same forgiveness the
    // rest of this module gives.
    const record = await loadEdition(dir, latest)
    return record.state === 'edition' ? record.edition : null
  },
)

/**
 * The themes this edition actually carries, in the canonical order.
 *
 * Derived from the items and never from `THEMES`, because a theme with no
 * supply is a correct edition and a chip that filters to nothing is a broken
 * one — the same argument `types.ts` makes about the closed set.
 *
 * **Empty is a real answer.** `content/days/2026-08-08.json` predates the field
 * entirely, and its twenty items must render as one ungrouped list rather than
 * as five empty sections or a filter row with nothing behind it.
 *
 * The order is `config.ts`'s, not the order the themes happen to appear in:
 * the section order on the page is editorial, and reading it off rank 1's theme
 * would reshuffle the whole page whenever the lead changed.
 */
export function themesOf(edition: Edition): Theme[] {
  const present = new Set(edition.items.map((item) => item.theme))
  return THEMES.filter((theme) => present.has(theme))
}

/**
 * Whether the day was short of what it was built against.
 *
 * **`targetCount` is read off the edition, never from `TARGET_COUNT`.** The
 * constant is thirty today and was twenty when `2026-08-08.json` was written,
 * so measuring against the constant labels a complete twenty-item edition a
 * thin day — permanently, and in the masthead. The field exists precisely so
 * an edition records the ceiling it was built against; `archive.ts` writes it
 * even when the edition is short, for this.
 */
export function isThin(edition: Edition): boolean {
  return edition.items.length < edition.targetCount
}
