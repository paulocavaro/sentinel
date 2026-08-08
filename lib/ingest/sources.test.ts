import { describe, expect, it } from 'vitest'
import { buildRequestUrls, HN_QUERIES, SOURCES } from './sources'

describe('SOURCES', () => {
  it('has unique ids', () => {
    expect(new Set(SOURCES.map((s) => s.id)).size).toBe(SOURCES.length)
  })

  it('has every url absolute and https', () => {
    for (const s of SOURCES) expect(s.url.startsWith('https://')).toBe(true)
  })

  it('carries both lanes, with world a minority of sources', () => {
    const world = SOURCES.filter((s) => s.lane === 'world')
    expect(world.length).toBeGreaterThan(0)
    expect(world.length).toBeLessThan(SOURCES.length / 2)
  })

  it('gives Hacker News the worst priority, so an outlet always wins a tie', () => {
    const hn = SOURCES.find((s) => s.id === 'hn')!
    for (const s of SOURCES) if (s.id !== 'hn') expect(s.priority).toBeLessThan(hn.priority)
  })

  it('excludes arXiv and YouTube in this phase', () => {
    const urls = SOURCES.map((s) => s.url).join(' ')
    expect(urls).not.toContain('arxiv')
    expect(urls).not.toContain('youtube')
  })
})

describe('buildRequestUrls', () => {
  const since = new Date('2026-08-06T09:00:00Z')

  it('returns the feed url unchanged for an RSS source', () => {
    const s = SOURCES.find((x) => x.format === 'rss')!
    expect(buildRequestUrls(s, { since })).toEqual([s.url])
  })

  it('returns one url per query for Hacker News', () => {
    const hn = SOURCES.find((s) => s.id === 'hn')!
    expect(buildRequestUrls(hn, { since })).toHaveLength(HN_QUERIES.length)
  })

  it('filters Hacker News by points and time server-side', () => {
    const hn = SOURCES.find((s) => s.id === 'hn')!
    const url = buildRequestUrls(hn, { since })[0]
    expect(url).toContain('numericFilters=')
    expect(decodeURIComponent(url)).toContain('points>=10')
    expect(decodeURIComponent(url)).toContain(`created_at_i>${Math.floor(since.getTime() / 1000)}`)
    expect(url).toContain('hitsPerPage=')
  })
})
