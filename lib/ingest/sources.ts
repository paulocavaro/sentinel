import type { Source } from './types'

/**
 * The eleven sources of phase 01. `priority` breaks a dedupe tie: lower wins.
 *
 * 1 — the organization announcing its own work, the closest thing to a primary
 *     source there is.
 * 2 — established outlets with their own reporting.
 * 3 — individual commentary, which is usually reacting to one of the above.
 * 9 — Hacker News, which is an index of other people's links. It must never win
 *     a tie, or the edition credits a TechCrunch story to a forum thread.
 */
export const SOURCES: Source[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    kind: 'press',
    format: 'rss',
    lane: 'ai',
    url: 'https://openai.com/news/rss.xml',
    priority: 1,
  },
  {
    id: 'deepmind',
    name: 'Google DeepMind',
    kind: 'blog',
    format: 'rss',
    lane: 'ai',
    url: 'https://deepmind.google/blog/rss.xml',
    priority: 1,
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    kind: 'blog',
    format: 'rss',
    lane: 'ai',
    url: 'https://huggingface.co/blog/feed.xml',
    priority: 1,
  },
  {
    id: 'techcrunch',
    name: 'TechCrunch AI',
    kind: 'press',
    format: 'rss',
    lane: 'ai',
    url: 'https://techcrunch.com/category/artificial-intelligence/feed/',
    priority: 2,
  },
  {
    id: 'arstechnica',
    name: 'Ars Technica AI',
    kind: 'press',
    format: 'rss',
    lane: 'ai',
    url: 'https://arstechnica.com/ai/feed/',
    priority: 2,
  },
  {
    id: 'technologyreview',
    name: 'MIT Technology Review',
    kind: 'press',
    format: 'rss',
    lane: 'ai',
    url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed',
    priority: 2,
  },
  {
    id: 'guardian',
    name: 'The Guardian AI',
    kind: 'press',
    format: 'rss',
    lane: 'ai',
    url: 'https://www.theguardian.com/technology/artificialintelligenceai/rss',
    priority: 2,
  },
  {
    id: 'bbc-world',
    name: 'BBC World',
    kind: 'press',
    format: 'rss',
    lane: 'world',
    url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
    priority: 2,
  },
  {
    id: 'npr-world',
    name: 'NPR World',
    kind: 'press',
    format: 'rss',
    lane: 'world',
    url: 'https://feeds.npr.org/1004/rss.xml',
    priority: 2,
  },
  {
    id: 'simonwillison',
    name: 'Simon Willison',
    kind: 'blog',
    format: 'atom',
    lane: 'ai',
    url: 'https://simonwillison.net/atom/everything/',
    priority: 3,
  },
  {
    id: 'hn',
    name: 'Hacker News',
    kind: 'forum',
    format: 'hn',
    lane: 'ai',
    url: 'https://hn.algolia.com/api/v1/search_by_date',
    priority: 9,
  },
]

/** One Algolia request per query — the API has no OR operator across terms. */
export const HN_QUERIES = ['AI', 'LLM', 'OpenAI', 'Anthropic']

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
