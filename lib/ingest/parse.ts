import { XMLParser } from 'fast-xml-parser'
import { itemId } from './canonical'
import { sanitizeText } from './sanitize'
import type { RawItem, Source } from './types'

/**
 * Feed parsing. Everything on the other side of this module is untrusted: the
 * title, the summary, the link and the image URL are all written by whoever
 * publishes the feed, and on Hacker News by whoever submitted the story.
 *
 * Three guarantees hold for every item this module returns:
 *
 * 1. `title` and `summary` have been through `sanitizeText` — decoded, stripped
 *    of markup, flattened to one line and truncated. Titles are as attacker-
 *    writable as summaries, so both are sanitized.
 * 2. `publishedAt` is ISO 8601. Feeds ship RFC-822 (`"Fri, 07 Aug 2026
 *    10:00:00 GMT"`) or RFC-3339, the archive is permanent, and a format
 *    mistake here is unfixable later. An unparseable date drops the item.
 * 3. `url` and `imageUrl` are absolute http(s) URLs. Anything else — a
 *    `javascript:` link, a `data:` image, a relative path — is discarded.
 *
 * Nothing here touches the network. The `og:image` fallback for items whose
 * feed carries no image is Task 8.
 */

const TITLE_MAX = 200
const SUMMARY_MAX = 400

const HN_ITEM_URL = 'https://news.ycombinator.com/item?id='

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' })

type XmlNode = Record<string, unknown>

/**
 * fast-xml-parser collapses a single repeated element into one object instead
 * of a one-element array, so a feed with exactly one item looks structurally
 * different from a feed with two. Normalize before iterating.
 */
function toArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

function isNode(value: unknown): value is XmlNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The text of a node, whether the parser gave us a bare string, a number
 * (`parseTagValue` turns a numeric title into one) or an element carrying
 * attributes, where the text sits under `#text`.
 */
function text(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(text).join(' ')
  if (isNode(value)) return text(value['#text'])
  return ''
}

function attr(node: unknown, name: string): string {
  return isNode(node) ? text(node[`@${name}`]) : ''
}

/** The first defined value among the given keys. */
function pick(node: unknown, ...keys: string[]): unknown {
  if (!isNode(node)) return undefined
  for (const key of keys) {
    if (node[key] !== undefined && node[key] !== null) return node[key]
  }
  return undefined
}

/** An absolute http(s) URL, or null. Keeps `javascript:` and `data:` out. */
function httpUrl(value: unknown): string | null {
  const raw = text(value).trim()
  if (!raw) return null
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
    return parsed.toString()
  } catch {
    return null
  }
}

/** ISO 8601, or null when the feed's date does not parse. */
function toIso(value: unknown): string | null {
  const raw = text(value).trim()
  if (!raw) return null
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

/**
 * The image the feed itself declares, in descending order of how deliberate it
 * is: `media:content` is the article's chosen image, `media:thumbnail` a
 * derived crop, `enclosure` a generic attachment that may not be an image at
 * all — hence the type check on it.
 */
function feedImage(node: unknown): string | null {
  for (const candidate of toArray(pick(node, 'media:content'))) {
    const medium = attr(candidate, 'medium')
    const type = attr(candidate, 'type')
    if (medium && medium !== 'image') continue
    if (type && !type.startsWith('image/')) continue
    const url = httpUrl(attr(candidate, 'url'))
    if (url) return url
  }

  for (const candidate of toArray(pick(node, 'media:thumbnail'))) {
    const url = httpUrl(attr(candidate, 'url'))
    if (url) return url
  }

  for (const candidate of toArray(pick(node, 'enclosure'))) {
    const type = attr(candidate, 'type')
    if (type && !type.startsWith('image/')) continue
    const url = httpUrl(attr(candidate, 'url'))
    if (url) return url
  }

  return null
}

type Draft = {
  title: unknown
  summary: unknown
  url: string | null
  imageUrl: string | null
  date: unknown
}

/**
 * The one place a `RawItem` is built. An item without a usable link, without a
 * parseable date, or without a title once sanitized is dropped: each of those
 * makes it unusable downstream, and a silent `undefined` in the archive is
 * worse than one fewer candidate.
 */
function buildItem(source: Source, draft: Draft): RawItem | null {
  if (!draft.url) return null

  const publishedAt = toIso(draft.date)
  if (!publishedAt) return null

  const title = sanitizeText(text(draft.title), TITLE_MAX)
  if (!title) return null

  return {
    id: itemId(draft.url),
    title,
    summary: sanitizeText(text(draft.summary), SUMMARY_MAX),
    url: draft.url,
    imageUrl: draft.imageUrl,
    source: {
      id: source.id,
      name: source.name,
      kind: source.kind,
      priority: source.priority,
    },
    // The allowed set, not a decision. Which one of them the item is filed
    // under is curation's call, and validation checks it against this list.
    themes: source.themes,
    publishedAt,
  }
}

function parseRss(source: Source, body: string): RawItem[] {
  const root = parser.parse(body) as XmlNode
  const channel = toArray(pick(root, 'rss', 'rdf:RDF') ?? root)
    .flatMap((feed) => toArray(pick(feed, 'channel')))
    .at(0)

  // RSS 1.0 hangs `<item>` off the root rather than off `<channel>`.
  const items = [...toArray(pick(channel, 'item')), ...toArray(pick(root, 'item'))]

  return items
    .map((item) =>
      buildItem(source, {
        title: pick(item, 'title'),
        summary: pick(item, 'description', 'content:encoded', 'summary'),
        url: httpUrl(pick(item, 'link')),
        imageUrl: feedImage(item),
        date: pick(item, 'pubDate', 'dc:date', 'published', 'updated'),
      }),
    )
    .filter((item): item is RawItem => item !== null)
}

/** Atom puts the target in `<link href>`, and may list several `rel` variants. */
function atomLink(entry: unknown): string | null {
  const links = toArray(pick(entry, 'link'))
  const alternate = links.find((link) => {
    const rel = attr(link, 'rel')
    return rel === '' || rel === 'alternate'
  })
  return httpUrl(attr(alternate ?? links[0], 'href'))
}

function parseAtom(source: Source, body: string): RawItem[] {
  const root = parser.parse(body) as XmlNode
  const entries = toArray(pick(root, 'feed')).flatMap((feed) => toArray(pick(feed, 'entry')))

  return entries
    .map((entry) =>
      buildItem(source, {
        title: pick(entry, 'title'),
        summary: pick(entry, 'summary', 'content'),
        url: atomLink(entry),
        imageUrl: feedImage(entry),
        date: pick(entry, 'published', 'updated'),
      }),
    )
    .filter((entry): entry is RawItem => entry !== null)
}

function parseHackerNews(source: Source, body: string): RawItem[] {
  const payload: unknown = JSON.parse(body)
  const hits = isNode(payload) ? toArray(payload.hits) : []

  return hits
    .map((hit) => {
      // Ask HN and Show HN text posts carry no url — the thread is the story.
      const objectId = text(pick(hit, 'objectID')).trim()
      const url =
        httpUrl(pick(hit, 'url')) ??
        (objectId ? `${HN_ITEM_URL}${encodeURIComponent(objectId)}` : null)

      return buildItem(source, {
        title: pick(hit, 'title', 'story_title'),
        summary: pick(hit, 'story_text', 'comment_text'),
        url,
        imageUrl: null,
        date: pick(hit, 'created_at'),
      })
    })
    .filter((hit): hit is RawItem => hit !== null)
}

/**
 * Parse one fetched body into items. A malformed body is an ordinary outcome —
 * a source can serve an error page, a truncated response or plain HTML — so it
 * yields an empty array and lets the caller record a source failure. It never
 * throws.
 */
export function parseFeed(source: Source, body: string): RawItem[] {
  try {
    switch (source.format) {
      case 'rss':
        return parseRss(source, body)
      case 'atom':
        return parseAtom(source, body)
      case 'hn':
        return parseHackerNews(source, body)
      default:
        return []
    }
  } catch {
    return []
  }
}
