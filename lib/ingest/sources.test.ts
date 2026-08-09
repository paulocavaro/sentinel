import { describe, expect, it } from 'vitest'
import { buildRequestUrls, HN_QUERIES, SOURCES } from './sources'
import { THEMES } from './types'
import type { Theme } from './types'

describe('SOURCES', () => {
  it('has unique ids', () => {
    expect(new Set(SOURCES.map((s) => s.id)).size).toBe(SOURCES.length)
  })

  it('has every url absolute and https', () => {
    for (const s of SOURCES) expect(s.url.startsWith('https://')).toBe(true)
  })

  it('gives every source at least one theme, all of them real themes', () => {
    for (const s of SOURCES) {
      expect(s.themes.length).toBeGreaterThan(0)
      for (const theme of s.themes) expect(THEMES).toContain(theme)
    }
  })

  it('can supply every theme, so no band is unreachable by construction', () => {
    // A theme with no source at all would make its minimum permanently
    // unmeetable, and the edition would be short every day for a reason nothing
    // in the output points at.
    for (const theme of THEMES) {
      expect(SOURCES.some((s) => s.themes.includes(theme))).toBe(true)
    }
  })

  it('keeps allowlists tight, widening only where the source honestly is wide', () => {
    // The regression this guards: quietly adding a theme to a narrow source to
    // make a thin day's band pass. Every extra theme is a theme the model may
    // file an item under, and validation would then permit it.
    const allowed: Record<string, Theme[]> = {
      'guardian-ai': ['ai', 'world'],
      hn: ['ai', 'games', 'science'],
    }

    for (const s of SOURCES) {
      const expected = allowed[s.id]
      if (expected) expect([...s.themes]).toEqual(expected)
      else expect(s.themes).toHaveLength(1)
    }
  })

  it('keeps world a minority of sources, so the wires cannot dominate intake', () => {
    const world = SOURCES.filter((s) => s.themes.includes('world'))
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

  it('queries Hacker News for every theme its allowlist permits', () => {
    // HN is allowed games and science. If the query list only asked about AI
    // those two permissions would be dead letters — the source could supply
    // them and never would, and nothing would report it.
    const asked = HN_QUERIES.join(' ').toLowerCase()
    expect(asked).toMatch(/\bai\b/)
    expect(asked).toMatch(/gam/)
    expect(asked).toMatch(/science|physics|space/)
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
