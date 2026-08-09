import type { Source } from './types'

/**
 * The eighteen sources. `priority` breaks a dedupe tie: lower wins.
 *
 * 1 — the organization announcing its own work, the closest thing to a primary
 *     source there is.
 * 2 — established outlets with their own reporting.
 * 3 — individual commentary, which is usually reacting to one of the above.
 * 9 — Hacker News, which is an index of other people's links. It must never win
 *     a tie, or the edition credits a TechCrunch story to a forum thread.
 *
 * `themes` is an allowlist, not a label: it is the set an item from this source
 * may be assigned, and validation rejects a curation that puts an item outside
 * it. Tight where the source is narrow — Eurogamer is games and nothing else —
 * and wide only where the source honestly is: The Guardian's AI section runs
 * policy and regulation stories that are world news by any reading, and Hacker
 * News carries whatever was submitted.
 */
export const SOURCES: Source[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    kind: 'press',
    format: 'rss',
    themes: ['ai'],
    url: 'https://openai.com/news/rss.xml',
    priority: 1,
  },
  {
    id: 'deepmind',
    name: 'Google DeepMind',
    kind: 'blog',
    format: 'rss',
    themes: ['ai'],
    url: 'https://deepmind.google/blog/rss.xml',
    priority: 1,
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    kind: 'blog',
    format: 'rss',
    themes: ['ai'],
    url: 'https://huggingface.co/blog/feed.xml',
    priority: 1,
  },
  {
    id: 'techcrunch-ai',
    name: 'TechCrunch AI',
    kind: 'press',
    format: 'rss',
    themes: ['ai'],
    url: 'https://techcrunch.com/category/artificial-intelligence/feed/',
    priority: 2,
  },
  {
    id: 'ars-ai',
    name: 'Ars Technica AI',
    kind: 'press',
    format: 'rss',
    themes: ['ai'],
    url: 'https://arstechnica.com/ai/feed/',
    priority: 2,
  },
  {
    id: 'mit-tr',
    name: 'MIT Technology Review',
    kind: 'press',
    format: 'rss',
    themes: ['ai'],
    url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed',
    priority: 2,
  },
  {
    id: 'guardian-ai',
    name: 'The Guardian AI',
    kind: 'press',
    format: 'rss',
    themes: ['ai', 'world'],
    url: 'https://www.theguardian.com/technology/artificialintelligenceai/rss',
    priority: 2,
  },
  {
    id: 'bbc-world',
    name: 'BBC World',
    kind: 'press',
    format: 'rss',
    themes: ['world'],
    url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
    priority: 2,
  },
  {
    id: 'npr-world',
    name: 'NPR World',
    kind: 'press',
    format: 'rss',
    themes: ['world'],
    url: 'https://feeds.npr.org/1004/rss.xml',
    priority: 2,
  },
  {
    id: 'eurogamer',
    name: 'Eurogamer',
    kind: 'press',
    format: 'rss',
    themes: ['games'],
    url: 'https://www.eurogamer.net/feed',
    priority: 2,
  },
  {
    id: 'gamesindustry',
    name: 'GamesIndustry.biz',
    kind: 'press',
    format: 'rss',
    themes: ['games'],
    url: 'https://www.gamesindustry.biz/feed',
    priority: 2,
  },
  {
    id: 'ars-science',
    name: 'Ars Technica Science',
    kind: 'press',
    format: 'rss',
    themes: ['science'],
    url: 'https://arstechnica.com/science/feed/',
    priority: 2,
  },
  {
    id: 'scientific-american',
    name: 'Scientific American',
    kind: 'press',
    format: 'rss',
    themes: ['science'],
    url: 'https://www.scientificamerican.com/platform/syndication/rss/',
    priority: 2,
  },
  {
    id: 'quanta',
    name: 'Quanta Magazine',
    kind: 'press',
    format: 'rss',
    themes: ['science'],
    url: 'https://www.quantamagazine.org/feed/',
    priority: 2,
  },
  {
    id: 'polygon',
    name: 'Polygon',
    kind: 'press',
    format: 'rss',
    themes: ['culture'],
    url: 'https://www.polygon.com/rss/index.xml',
    priority: 2,
  },
  {
    id: 'variety',
    name: 'Variety',
    kind: 'press',
    format: 'rss',
    themes: ['culture'],
    url: 'https://variety.com/feed/',
    priority: 2,
  },
  {
    id: 'simonwillison',
    name: 'Simon Willison',
    kind: 'blog',
    format: 'atom',
    themes: ['ai'],
    url: 'https://simonwillison.net/atom/everything/',
    priority: 3,
  },
  {
    id: 'hn',
    name: 'Hacker News',
    kind: 'forum',
    format: 'hn',
    themes: ['ai', 'games', 'science'],
    url: 'https://hn.algolia.com/api/v1/search_by_date',
    priority: 9,
  },
]

/**
 * One Algolia request per query — the API has no OR operator across terms.
 *
 * Grouped by the theme each term is there to feed, because Hacker News is the
 * only source whose allowlist spans three themes and a query list that only
 * asked about AI would make the other two dead letters: the source would be
 * permitted to supply games and science and would never carry a candidate for
 * either. Culture and world are deliberately absent — HN is not where either is
 * reported, and the outlets above cover them.
 */
export const HN_QUERIES = [
  // ai
  'AI',
  'LLM',
  'OpenAI',
  'Anthropic',
  // games
  'game',
  'gaming',
  // science
  'science',
  'physics',
  'space',
]

/** Below this, a submission is noise. Applied server-side, never after fetching. */
export const HN_MIN_POINTS = 10

const HN_HITS_PER_PAGE = 50

/**
 * The URLs to fetch for one source.
 *
 * Feeds are a single request. Hacker News is one request per query, and the
 * score and time filters must travel in the URL: `search_by_date` returns the
 * newest submissions, nearly all of which have zero points, so filtering after
 * the fact would routinely leave nothing.
 */
export function buildRequestUrls(source: Source, opts: { since: Date }): string[] {
  if (source.format !== 'hn') return [source.url]

  const sinceUnix = Math.floor(opts.since.getTime() / 1000)

  return HN_QUERIES.map((query) => {
    const url = new URL(source.url)
    url.search = new URLSearchParams({
      query,
      tags: 'story',
      numericFilters: `points>=${HN_MIN_POINTS},created_at_i>${sinceUnix}`,
      hitsPerPage: String(HN_HITS_PER_PAGE),
    }).toString()
    return url.toString()
  })
}
