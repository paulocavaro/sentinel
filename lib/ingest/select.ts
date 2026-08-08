import { canonicalUrl } from './canonical'
import type { RawItem } from './types'

/**
 * The selection stage: narrow ~120 collected items down to the candidates the
 * model is allowed to choose from.
 *
 * Three filters, always in this order — window, then exclusion, then dedupe.
 * The order is not cosmetic. Exclusion has to run before dedupe: if dedupe went
 * first, an already-published item could win its cluster on priority, be
 * excluded a moment later, and take a still-unpublished sibling down with it —
 * silently deleting a story that had every right to run.
 */

/**
 * Publishers routinely stamp an hour or two ahead — scheduled posts, embargoes,
 * a newsroom clock that is not quite UTC. Without this tolerance those items
 * fall outside the window on the day they are news and are already too old by
 * the next run, so they are never published at all.
 */
const FUTURE_TOLERANCE_HOURS = 2

/**
 * Jaccard overlap at which two normalized titles are treated as one story.
 *
 * **0.8 is deliberately conservative, and the wrong instinct is to lower it.**
 * Measured against real headline pairs, the two distributions overlap: genuine
 * cross-outlet rewrites of one story ("Anthropic launches Claude Opus 5" vs
 * "Anthropic's Claude Opus 5 arrives with a 1M context window") score 0.33–0.50,
 * while pairs that must *not* merge — two launches differing only in the product
 * name, two funding rounds differing only in the amount — score 0.67–0.75. No
 * threshold separates them, so there is no clever number to find here.
 *
 * Given that, the choice is which error to make. Missing a duplicate costs one
 * redundant slot out of twenty; a false merge silently deletes a real story and
 * nobody ever learns it existed. 0.8 is the lowest value that produced no false
 * merge in testing, so bag-of-words dedupe only catches near-verbatim reposts
 * and syndication. Cross-outlet rewrites are caught the next day instead, by the
 * archive's title exclusion — and genuinely need embeddings to catch same-day.
 */
const TITLE_OVERLAP_THRESHOLD = 0.8

/** Ids and normalized titles of everything already published. */
export type PublishedIndex = {
  ids: ReadonlySet<string>
  /** Already normalized by the archive; normalizing again is a no-op. */
  titles: ReadonlySet<string>
}

export type WindowResult = {
  kept: RawItem[]
  /** Items dropped because their date could not be read. Surfaced in the run summary. */
  unparseable: number
}

export type SelectOptions = {
  now: Date
  windowHours: number
  published: PublishedIndex
}

export type SelectResult = {
  candidates: RawItem[]
  unparseable: number
}

const NON_ALPHANUMERIC = /[^a-z0-9]+/g

/**
 * Reduce a title to a comparison key: lowercase, every run of non-alphanumerics
 * flattened to one space, trimmed.
 *
 * Punctuation, smart quotes and casing are exactly the things two outlets differ
 * on while reporting the same fact, and they are also what makes the same story
 * look new to an id-based check the following day. Idempotent, so a title read
 * back out of the archive normalizes to itself.
 */
export function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(NON_ALPHANUMERIC, ' ').trim()
}

function titleTokens(title: string): Set<string> {
  const normalized = normalizeTitle(title)
  return new Set(normalized.length === 0 ? [] : normalized.split(' '))
}

/** Jaccard: shared tokens over total distinct tokens. */
function overlap(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0

  let shared = 0
  for (const token of a) if (b.has(token)) shared += 1

  const union = a.size + b.size - shared
  return union === 0 ? 0 : shared / union
}

/**
 * Keep the items published inside the last `hours`, allowing a small future
 * tolerance.
 *
 * An unparseable date is dropped **and counted**. It has to be counted
 * separately: `Date.parse` returns `NaN`, every comparison against `NaN` is
 * false, so a broken date fails the window check for reasons that look identical
 * to being too old. Without the counter a parser regression that mangles every
 * date on one feed reads as "that source had a quiet day".
 */
export function withinWindow(items: readonly RawItem[], now: Date, hours: number): WindowResult {
  const oldest = now.getTime() - hours * 3_600_000
  const newest = now.getTime() + FUTURE_TOLERANCE_HOURS * 3_600_000

  const kept: RawItem[] = []
  let unparseable = 0

  for (const item of items) {
    const published = Date.parse(item.publishedAt)
    if (Number.isNaN(published)) {
      unparseable += 1
      continue
    }
    if (published >= oldest && published <= newest) kept.push(item)
  }

  return { kept, unparseable }
}

/**
 * Drop everything that has already run in a previous edition.
 *
 * Both checks are needed. The id catches the same URL; the normalized title
 * catches the same *story* arriving from a different outlet, which has a
 * different URL and therefore a different id. The 48h window guarantees that
 * overlap exists between consecutive editions, so title exclusion is the only
 * thing standing between a reader and yesterday's news reprinted.
 */
export function excludePublished(
  items: readonly RawItem[],
  published: PublishedIndex,
): RawItem[] {
  return items.filter(
    (item) => !published.ids.has(item.id) && !published.titles.has(normalizeTitle(item.title)),
  )
}

type Cluster = {
  members: RawItem[]
  tokens: Set<string>
  /** First position in the input, so survivor order matches collection order. */
  order: number
}

/**
 * The member that represents a cluster: lowest `source.priority` wins, and a
 * further tie goes to the earliest published.
 *
 * Priority first, not date first. "Earliest wins" sounds neutral but it
 * systematically prefers the wire copy and the Hacker News submission over the
 * newsroom that actually reported the story — Hacker News in particular is an
 * index of other people's links, and crediting it would misattribute the work.
 * The date is only a tie-break between peers.
 */
function best(members: readonly RawItem[]): RawItem {
  return members.reduce((winner, candidate) => {
    if (candidate.source.priority !== winner.source.priority) {
      return candidate.source.priority < winner.source.priority ? candidate : winner
    }
    const candidateAt = Date.parse(candidate.publishedAt)
    const winnerAt = Date.parse(winner.publishedAt)
    if (Number.isNaN(candidateAt)) return winner
    if (Number.isNaN(winnerAt)) return candidate
    return candidateAt < winnerAt ? candidate : winner
  })
}

/**
 * Collapse duplicates, keeping one item per story.
 *
 * Two passes, because the two kinds of duplicate look nothing alike. Identical
 * links — the same article syndicated, or an aggregator pointing at the
 * original — collapse exactly on the canonical URL. The same story written up
 * independently shares no URL at all, and is only visible through its title.
 *
 * The title pass is greedy and compares a group against the clusters already
 * formed, which is O(n²) on a list of roughly a hundred: irrelevant here, and
 * simpler to reason about than a union-find.
 */
export function dedupe(items: readonly RawItem[]): RawItem[] {
  // Pass one: exact grouping on the canonical URL.
  const byUrl = new Map<string, RawItem[]>()
  for (const item of items) {
    const key = canonicalUrl(item.url)
    const group = byUrl.get(key)
    if (group) group.push(item)
    else byUrl.set(key, [item])
  }

  // Pass two: merge URL groups whose titles describe the same story. A group is
  // compared through its own best member, so the cluster is judged by the title
  // that will actually be published.
  const clusters: Cluster[] = []

  for (const group of byUrl.values()) {
    const representative = best(group)
    const tokens = titleTokens(representative.title)
    const order = items.indexOf(representative)

    const match = clusters.find((cluster) => overlap(cluster.tokens, tokens) >= TITLE_OVERLAP_THRESHOLD)

    if (match) {
      match.members.push(...group)
      // Re-key the cluster on its new best member, so a later group is compared
      // against the title that would be published rather than the first one seen.
      const winner = best(match.members)
      match.tokens = titleTokens(winner.title)
      match.order = Math.min(match.order, order)
    } else {
      clusters.push({ members: [...group], tokens, order })
    }
  }

  return clusters.sort((a, b) => a.order - b.order).map((cluster) => best(cluster.members))
}

/**
 * Window, then exclusion, then dedupe. See the note at the top of the file for
 * why that order is load-bearing.
 *
 * `unparseable` is carried out rather than swallowed: it is the only signal that
 * a feed's dates have stopped parsing, and the run summary reports it.
 */
export function selectCandidates(items: readonly RawItem[], opts: SelectOptions): SelectResult {
  const { kept, unparseable } = withinWindow(items, opts.now, opts.windowHours)
  const unpublished = excludePublished(kept, opts.published)

  return { candidates: dedupe(unpublished), unparseable }
}
