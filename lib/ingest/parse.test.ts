import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFeed } from './parse'
import type { Source } from './types'

const fixture = (n: string) => readFileSync(join(__dirname, '__fixtures__', n), 'utf8')
const src = (format: Source['format'], over: Partial<Source> = {}): Source => ({
  id: 's', name: 'S', kind: 'press', format, themes: ['ai'],
  url: 'https://e.com/feed', priority: 1, ...over,
})

describe('parseFeed', () => {
  it('reads title, url, summary and date from RSS', () => {
    const items = parseFeed(src('rss'), fixture('rss.xml'))
    expect(items).toHaveLength(2)
    expect(items[0].title).toBeTruthy()
    expect(items[0].url.startsWith('https://')).toBe(true)
  })

  it('emits publishedAt as ISO 8601, not the raw feed format', () => {
    const items = parseFeed(src('rss'), fixture('rss.xml'))
    expect(items[0].publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it('drops an item whose date cannot be parsed', () => {
    const body = `<rss><channel><item><title>A</title>
      <link>https://a.com/1</link><pubDate>whenever</pubDate></item></channel></rss>`
    expect(parseFeed(src('rss'), body)).toEqual([])
  })

  it('sanitizes titles as well as summaries', () => {
    const items = parseFeed(src('rss'), fixture('rss.xml'))
    expect(items.map((i) => i.title).join(' ')).not.toContain('&amp;')
    expect(items[0].summary).not.toContain('<')
  })

  it('reads Atom entries', () => {
    expect(parseFeed(src('atom'), fixture('atom.xml'))).toHaveLength(2)
  })

  it('reads Hacker News JSON and carries the source kind through', () => {
    const items = parseFeed(src('hn', { kind: 'forum' }), fixture('hn.json'))
    expect(items).toHaveLength(2)
    expect(items[0].source.kind).toBe('forum')
  })

  it('falls back to the discussion permalink when a Hacker News hit has no url', () => {
    const items = parseFeed(src('hn', { kind: 'forum' }), fixture('hn.json'))
    const askHn = items.find((i) => i.url.includes('news.ycombinator.com'))
    expect(askHn).toBeDefined()
  })

  it('extracts an image when the feed carries one and null when it does not', () => {
    const items = parseFeed(src('rss'), fixture('rss.xml'))
    expect(items[0].imageUrl).toMatch(/^https:\/\//)
    expect(items[1].imageUrl).toBeNull()
  })

  it('returns an empty array for a malformed body instead of throwing', () => {
    expect(parseFeed(src('rss'), 'not xml at all')).toEqual([])
  })

  it('gives every item the id derived from its canonical url', () => {
    expect(parseFeed(src('rss'), fixture('rss.xml'))[0].id).toMatch(/^[0-9a-f]{12}$/)
  })
})
