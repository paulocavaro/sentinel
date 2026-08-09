export type SourceKind = 'blog' | 'press' | 'paper' | 'video' | 'forum'
export type SourceFormat = 'rss' | 'atom' | 'hn'

/**
 * The five themes an edition is read through.
 *
 * A closed set, not a free tag: the bands in `config.ts` are keyed by it, the
 * curation is validated against it, and the page's filter row is derived from
 * the themes actually present in the day's items — never from this list, because
 * a theme with no supply is a correct edition and a chip that filters to nothing
 * is a broken one.
 */
export type Theme = 'ai' | 'world' | 'games' | 'science' | 'culture'

export const THEMES: readonly Theme[] = ['ai', 'world', 'games', 'science', 'culture']

export type Source = {
  id: string
  name: string
  kind: SourceKind
  format: SourceFormat
  /**
   * The themes an item from this source may be assigned.
   *
   * An allowlist rather than a label, because a source is not always one thing:
   * The Guardian's AI section carries policy stories that read as world news,
   * and Hacker News carries whatever was submitted. Tight where the source is
   * narrow, wide only where it honestly is — every extra theme here is a theme
   * the model may put an item in, and validation enforces exactly this set.
   */
  themes: readonly Theme[]
  url: string
  /** Lower wins when two sources carry the same story. */
  priority: number
}

/** One item as collected, before curation. All strings already sanitized. */
export type RawItem = {
  id: string
  title: string
  summary: string
  url: string
  imageUrl: string | null
  source: { id: string; name: string; kind: SourceKind; priority: number }
  /** The allowed set, carried from the source. The single theme is chosen by curation. */
  themes: readonly Theme[]
  publishedAt: string // ISO 8601
}

/**
 * How many candidates each theme could possibly supply, counted from the
 * candidate pool and from nothing else.
 *
 * A candidate allowed two themes counts toward both, so these are upper bounds
 * rather than a partition: the sum can exceed the pool size. That is the right
 * shape for what it is used for — deciding whether a theme's minimum is
 * reachable at all — and it is why the effective minimum is
 * `min(band.min, supply)` rather than the band's own floor.
 */
export function themeSupply(candidates: readonly RawItem[]): Record<Theme, number> {
  const supply = Object.fromEntries(THEMES.map((theme) => [theme, 0])) as Record<Theme, number>

  for (const candidate of candidates) {
    for (const theme of candidate.themes) supply[theme] += 1
  }

  return supply
}

/** One item as published. */
export type Item = {
  id: string
  rank: number
  title: string
  description: string
  url: string
  image: string | null
  /** One theme, chosen by curation from the source's allowed set. */
  theme: Theme
  /**
   * Who published the article, derived from `url` — the card's byline.
   *
   * Deliberately not the feed's name. A feed is a discovery channel: Hacker
   * News links to Reuters, and "BBC World" is a section rather than a masthead.
   * Bylining an item with the feed tells the reader the tap will land somewhere
   * it will not.
   */
  publisher: string
  /**
   * Which feed found the item. Provenance, never a byline.
   *
   * Kept on the published item because it is real and unrecoverable from
   * anything else in the record: `url` cannot say that a Reuters story reached
   * the edition through Hacker News.
   */
  feed: { name: string; kind: SourceKind }
  publishedAt: string // ISO 8601
  topics: string[]
}

export type Edition = {
  date: string
  generatedAt: string
  summary: string
  targetCount: number
  items: Item[]
}
