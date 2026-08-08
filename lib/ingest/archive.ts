import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Curation } from './curate'
import { publisherFromUrl } from './publisher'
import { normalizeTitle } from './select'
import type { Edition, Item, RawItem } from './types'

/**
 * The archive: the only part of the pipeline that reads and writes the
 * permanent record.
 *
 * Two directions. `readPublished` and `editionExists` look backwards, at
 * everything already committed, and both are deliberately forgiving — a run
 * must never die because a file on disk is unreadable. `buildEdition` and
 * `writeEdition` look forwards, and `buildEdition` is deliberately strict,
 * because what it produces is permanent.
 */

/** Editions are named by the UTC date they cover. */
const EDITION_SUFFIX = '.json'

export type PublishedIndex = {
  ids: Set<string>
  /** Already normalized through `normalizeTitle` — see `readPublished`. */
  titles: Set<string>
}

function editionPath(dir: string, date: string): string {
  return join(dir, `${date}${EDITION_SUFFIX}`)
}

/** A published item as it survives a round trip through untrusted JSON. */
function readableItem(value: unknown): { id: string; title: string } | null {
  if (typeof value !== 'object' || value === null) return null

  const { id, title } = value as { id?: unknown; title?: unknown }
  if (typeof id !== 'string' || typeof title !== 'string') return null

  return { id, title }
}

/**
 * Every id and every normalized title ever published.
 *
 * **Titles are stored normalized**, because that is the form
 * `excludePublished` compares against: the same story arriving tomorrow from a
 * different outlet has different punctuation, different casing and a different
 * id, and the normalized title is the only thing the two versions share.
 * `normalizeTitle` is imported rather than reimplemented — two copies of a
 * normalization rule drifting apart is a duplicate story on the front page, and
 * nothing would report it.
 *
 * **This re-reads the whole archive on every run, and that is intentional.** At
 * twenty items a day an edition file is a few kilobytes; a decade of them is
 * single-digit megabytes read once, in a job that spends most of its time
 * waiting on the network. An incremental index would be a second source of
 * truth that can silently fall out of step with the files actually committed —
 * which is precisely the failure that lets a story run twice. This is not an
 * oversight; do not "optimize" it into a cache.
 *
 * Failures are absorbed at every level. A missing directory is the first-ever
 * run, not an error. An unreadable or unparseable file is skipped: one corrupt
 * edition would otherwise take down every run that followed it, forever, and
 * the cost of skipping it is at worst one repeated story.
 */
export async function readPublished(dir: string): Promise<PublishedIndex> {
  const ids = new Set<string>()
  const titles = new Set<string>()

  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    // No archive yet. The first run has nothing to exclude.
    return { ids, titles }
  }

  for (const entry of entries.sort()) {
    if (!entry.endsWith(EDITION_SUFFIX)) continue

    let parsed: unknown
    try {
      parsed = JSON.parse(await readFile(join(dir, entry), 'utf8'))
    } catch {
      continue
    }

    if (typeof parsed !== 'object' || parsed === null) continue

    const items = (parsed as { items?: unknown }).items
    if (!Array.isArray(items)) continue

    for (const raw of items) {
      const item = readableItem(raw)
      if (!item) continue

      ids.add(item.id)
      titles.add(normalizeTitle(item.title))
    }
  }

  return { ids, titles }
}

/**
 * Whether today's edition has already been written.
 *
 * The orchestrator's idempotence check: a second run on the same day returns
 * early rather than spending another model call. A missing directory or an
 * unreadable path answers false — the run then proceeds and either writes the
 * edition or fails visibly, both of which beat aborting on a stat.
 */
export async function editionExists(dir: string, date: string): Promise<boolean> {
  try {
    return (await stat(editionPath(dir, date))).isFile()
  } catch {
    return false
  }
}

export type BuildEditionOptions = {
  /** The UTC date this edition covers, `YYYY-MM-DD`. */
  date: string
  /** Injected clock, ISO 8601. Never `new Date()` in here. */
  generatedAt: string
  /** The ceiling the edition was built against, recorded even when it is short. */
  targetCount: number
  /** Task 8's `downloadImages` result: id → public path, misses simply absent. */
  images: ReadonlyMap<string, string>
}

/**
 * Assemble the edition from the curation and the candidates.
 *
 * **The model contributes exactly three things per item: the rank, the
 * description and the topics.** Title, URL, feed and publish date are read off
 * the candidate, which came from the feed, and the publisher is computed from
 * the candidate's URL. That split is the whole point of
 * this function. The model never sees a reason to restate a title and is never
 * asked for one, but a model that hallucinated a headline or a URL would
 * otherwise put it on a public page unchallenged, attributed to a real outlet —
 * and validation cannot catch a plausible-looking lie.
 *
 * `targetCount` is recorded even when the edition is short, so a reader (and a
 * later phase's UI) can tell "eight items because the day was thin" from
 * "eight items because something broke".
 */
export function buildEdition(
  curation: Curation,
  candidates: readonly RawItem[],
  opts: BuildEditionOptions,
): Edition {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]))

  const items: Item[] = [...curation.items]
    // The model returns its items in whatever order it generated them; `rank`
    // is the field that carries the editorial order, so sort on it rather than
    // trusting array position.
    .sort((a, b) => a.rank - b.rank)
    .map((chosen) => {
      const candidate = byId.get(chosen.id)

      // A precondition, not a runtime branch. `validateCuration` runs before
      // this in the real pipeline and reports an invented id as a reason, so
      // this cannot fire in situ — but nothing in this module enforces that
      // ordering, and a later refactor that moved validation would otherwise
      // publish `undefined.title` at 09:00 with no error anywhere. Throwing
      // turns a silent corruption of the permanent archive into exit code 1.
      if (!candidate) {
        throw new Error(
          `buildEdition: curated id ${chosen.id} has no matching candidate. ` +
            'validateCuration must run first.',
        )
      }

      return {
        id: candidate.id,
        rank: chosen.rank,
        // From the feed, never from the model.
        title: candidate.title,
        url: candidate.url,
        // Derived from the URL the reader will actually open, not from the feed
        // that surfaced it: seven of the first edition's twenty items were found
        // by Hacker News and published by Reuters, DeepMind, CNN and others.
        publisher: publisherFromUrl(candidate.url),
        // The feed survives as provenance. Dedupe priority still keys on it.
        feed: { name: candidate.source.name, kind: candidate.source.kind },
        publishedAt: candidate.publishedAt,
        // From the model.
        description: chosen.description,
        topics: chosen.topics,
        // A missing image is a designed state — the SSRF guard fired, the host
        // was down, or the feed simply carried no picture.
        image: opts.images.get(candidate.id) ?? null,
      }
    })

  return {
    date: opts.date,
    generatedAt: opts.generatedAt,
    summary: curation.summary,
    targetCount: opts.targetCount,
    items,
  }
}

/**
 * Write the edition, creating the directory if it is not there yet.
 *
 * Two-space indentation and a trailing newline: this file is committed to a
 * public repository by a bot and the only review it ever gets is a human
 * reading the diff. Minified JSON would make every edition a single changed
 * line and hide exactly the thing worth looking at.
 */
export async function writeEdition(dir: string, edition: Edition): Promise<string> {
  await mkdir(dir, { recursive: true })

  const path = editionPath(dir, edition.date)
  await writeFile(path, `${JSON.stringify(edition, null, 2)}\n`, 'utf8')

  return path
}
