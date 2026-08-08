import { describe, expect, it } from 'vitest'
import {
  dedupe,
  excludePublished,
  normalizeTitle,
  selectCandidates,
  withinWindow,
} from './select'
import type { RawItem } from './types'

const NOW = new Date('2026-08-08T12:00:00Z')
const hoursFromNow = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString()

let seq = 0

function item(over: Partial<RawItem> & { title: string }): RawItem {
  seq += 1
  const url = over.url ?? `https://example.com/${seq}`
  return {
    id: over.id ?? `id-${seq}`,
    title: over.title,
    summary: over.summary ?? 'A summary.',
    url,
    imageUrl: over.imageUrl ?? null,
    source: {
      id: 'techcrunch',
      name: 'TechCrunch AI',
      kind: 'press',
      priority: 2,
      ...over.source,
    },
    lane: over.lane ?? 'ai',
    publishedAt: over.publishedAt ?? hoursFromNow(-1),
  }
}

const titles = (items: readonly RawItem[]) => items.map((i) => i.title)
const nothingPublished = () => ({ ids: new Set<string>(), titles: new Set<string>() })

describe('normalizeTitle', () => {
  it('lowercases', () => {
    expect(normalizeTitle('Anthropic Ships Claude Opus 5')).toBe('anthropic ships claude opus 5')
  })

  it('replaces every run of non-alphanumerics with a single space', () => {
    expect(normalizeTitle("Anthropic's  Opus 5 — it's here!!")).toBe('anthropic s opus 5 it s here')
  })

  it('trims leading and trailing separators', () => {
    expect(normalizeTitle('  “Gemini 4” — ')).toBe('gemini 4')
  })

  it('is idempotent, so an already-normalized archive title normalizes to itself', () => {
    const once = normalizeTitle('Anthropic Ships Claude Opus 5!')
    expect(normalizeTitle(once)).toBe(once)
  })
})

describe('withinWindow', () => {
  it('keeps an item inside the window', () => {
    const inRange = item({ title: 'In range', publishedAt: hoursFromNow(-10) })
    const { kept } = withinWindow([inRange], NOW, 48)
    expect(titles(kept)).toEqual(['In range'])
  })

  it('drops an item older than the window', () => {
    const stale = item({ title: 'Too old', publishedAt: hoursFromNow(-49) })
    const { kept } = withinWindow([stale], NOW, 48)
    expect(kept).toEqual([])
  })

  // Publishers routinely stamp an hour or two ahead — a small future tolerance
  // is the difference between an embargoed post landing today and never at all.
  it('keeps an item stamped one hour in the future', () => {
    const ahead = item({ title: 'Slightly ahead', publishedAt: hoursFromNow(1) })
    const { kept } = withinWindow([ahead], NOW, 48)
    expect(titles(kept)).toEqual(['Slightly ahead'])
  })

  it('drops an item stamped five hours in the future', () => {
    const wrong = item({ title: 'Wildly ahead', publishedAt: hoursFromNow(5) })
    const { kept } = withinWindow([wrong], NOW, 48)
    expect(kept).toEqual([])
  })

  it('drops an unparseable date and counts it, rather than losing it silently', () => {
    const items = [
      item({ title: 'Good', publishedAt: hoursFromNow(-2) }),
      item({ title: 'Bad', publishedAt: 'whenever' }),
      item({ title: 'Also bad', publishedAt: '' }),
    ]
    const { kept, unparseable } = withinWindow(items, NOW, 48)
    expect(titles(kept)).toEqual(['Good'])
    expect(unparseable).toBe(2)
  })

  it('reports zero unparseable when every date is readable', () => {
    expect(withinWindow([item({ title: 'A' })], NOW, 48).unparseable).toBe(0)
  })
})

describe('excludePublished', () => {
  it('drops an item whose id already ran', () => {
    const items = [item({ title: 'Old news', id: 'abc' }), item({ title: 'Fresh', id: 'def' })]
    const out = excludePublished(items, { ids: new Set(['abc']), titles: new Set() })
    expect(titles(out)).toEqual(['Fresh'])
  })

  // The 48h window guarantees overlap between editions, so a story that ran
  // yesterday from one outlet reappears today from another with a different URL
  // and therefore a different id. Only the title catches it.
  it('drops an item whose normalized title already ran, across editions and outlets', () => {
    const items = [
      item({
        title: 'Anthropic Ships Claude Opus 5!',
        id: 'never-seen',
        url: 'https://arstechnica.com/opus-5',
        source: { id: 'arstechnica', name: 'Ars Technica AI', kind: 'press', priority: 2 },
      }),
      item({ title: 'Something else entirely', id: 'also-new' }),
    ]
    const out = excludePublished(items, {
      ids: new Set(),
      titles: new Set(['anthropic ships claude opus 5']),
    })
    expect(titles(out)).toEqual(['Something else entirely'])
  })

  it('keeps everything when nothing has been published', () => {
    const items = [item({ title: 'A' }), item({ title: 'B' })]
    expect(excludePublished(items, nothingPublished())).toHaveLength(2)
  })
})

describe('dedupe', () => {
  it('collapses two items sharing a canonical URL', () => {
    const items = [
      item({ title: 'Anthropic ships Claude Opus 5', url: 'https://e.com/a?utm_source=x' }),
      item({
        title: 'A wholly different headline about the same link',
        url: 'https://www.e.com/a/',
      }),
    ]
    expect(dedupe(items)).toHaveLength(1)
  })

  it('collapses the same story reported by two outlets, on title overlap alone', () => {
    const items = [
      item({
        title: 'Anthropic ships Claude Opus 5',
        url: 'https://techcrunch.com/opus-5',
      }),
      item({
        title: 'Anthropic Ships Claude Opus 5 Today',
        url: 'https://arstechnica.com/claude-opus-5',
        source: { id: 'arstechnica', name: 'Ars Technica AI', kind: 'press', priority: 2 },
      }),
    ]
    expect(dedupe(items)).toHaveLength(1)
  })

  // The rule that matters editorially: Hacker News is an index of other
  // people's links, so it must never be credited with a story an outlet wrote —
  // no matter which of the two was submitted first.
  it('keeps the better-priority source, not the earliest published', () => {
    const items = [
      item({
        title: 'Anthropic ships Claude Opus 5',
        url: 'https://news.ycombinator.com/item?id=1',
        publishedAt: hoursFromNow(-10),
        source: { id: 'hn', name: 'Hacker News', kind: 'forum', priority: 9 },
      }),
      item({
        title: 'Anthropic ships Claude Opus 5',
        url: 'https://techcrunch.com/opus-5',
        publishedAt: hoursFromNow(-2),
        source: { id: 'techcrunch', name: 'TechCrunch AI', kind: 'press', priority: 2 },
      }),
    ]
    const out = dedupe(items)
    expect(out).toHaveLength(1)
    expect(out[0].source.id).toBe('techcrunch')
  })

  it('falls back to the earliest published only when priorities are equal', () => {
    const items = [
      item({
        title: 'Anthropic ships Claude Opus 5',
        url: 'https://arstechnica.com/opus-5',
        publishedAt: hoursFromNow(-2),
        source: { id: 'arstechnica', name: 'Ars Technica AI', kind: 'press', priority: 2 },
      }),
      item({
        title: 'Anthropic ships Claude Opus 5',
        url: 'https://techcrunch.com/opus-5',
        publishedAt: hoursFromNow(-9),
        source: { id: 'techcrunch', name: 'TechCrunch AI', kind: 'press', priority: 2 },
      }),
    ]
    const out = dedupe(items)
    expect(out).toHaveLength(1)
    expect(out[0].source.id).toBe('techcrunch')
  })

  it('leaves genuinely different items alone', () => {
    const items = [
      item({ title: 'Anthropic ships Claude Opus 5', url: 'https://e.com/1' }),
      item({ title: 'Flooding displaces thousands in Pakistan', url: 'https://e.com/2', lane: 'world' }),
      item({ title: 'OpenAI hires a new head of policy', url: 'https://e.com/3' }),
    ]
    expect(dedupe(items)).toHaveLength(3)
  })

  // The 0.8 threshold is deliberately conservative. Two launches that differ by
  // a single significant token score 0.67 and must stay apart: merging them
  // would delete a real story, which is worse than publishing a near-duplicate.
  it('does not merge two launches that differ only in the product name', () => {
    const items = [
      item({ title: 'Anthropic ships Claude Opus 5', url: 'https://e.com/1' }),
      item({ title: 'Anthropic ships Claude Sonnet 5', url: 'https://e.com/2' }),
    ]
    expect(dedupe(items)).toHaveLength(2)
  })

  it('does not merge two funding rounds that differ only in the amount', () => {
    const items = [
      item({ title: 'OpenAI raises $10B at a $300B valuation', url: 'https://e.com/1' }),
      item({ title: 'OpenAI raises $40B at a $300B valuation', url: 'https://e.com/2' }),
    ]
    expect(dedupe(items)).toHaveLength(2)
  })

  it('merges a headline carrying an outlet suffix', () => {
    const items = [
      item({ title: 'EU agrees landmark AI Act enforcement rules', url: 'https://e.com/1' }),
      item({ title: 'EU agrees landmark AI Act enforcement rules | Reuters', url: 'https://f.com/2' }),
    ]
    expect(dedupe(items)).toHaveLength(1)
  })

  it('preserves input order among the survivors', () => {
    const items = [
      item({ title: 'First', url: 'https://e.com/1' }),
      item({ title: 'Second', url: 'https://e.com/2' }),
      item({ title: 'Third', url: 'https://e.com/3' }),
    ]
    expect(titles(dedupe(items))).toEqual(['First', 'Second', 'Third'])
  })

  it('returns an empty array for an empty input', () => {
    expect(dedupe([])).toEqual([])
  })
})

describe('selectCandidates', () => {
  it('composes window, exclusion and dedupe, in that order', () => {
    const items = [
      // Dropped by the window.
      item({ title: 'Ancient history', url: 'https://e.com/old', publishedAt: hoursFromNow(-72) }),
      // Dropped by the window, and counted.
      item({ title: 'Undated', url: 'https://e.com/undated', publishedAt: 'whenever' }),
      // Already published. It is also the better tie-break candidate of the pair
      // below, so if dedupe ran before exclusion it would win the cluster and
      // then be excluded, taking its still-unpublished sibling with it.
      item({
        title: 'Anthropic ships Claude Opus 5',
        url: 'https://techcrunch.com/opus-5',
        publishedAt: hoursFromNow(-20),
      }),
      item({
        title: 'Anthropic Ships Claude Opus 5 Today',
        url: 'https://arstechnica.com/opus-5',
        publishedAt: hoursFromNow(-4),
        source: { id: 'arstechnica', name: 'Ars Technica AI', kind: 'press', priority: 2 },
      }),
      item({ title: 'Flooding displaces thousands in Pakistan', url: 'https://e.com/flood', lane: 'world' }),
    ]

    const { candidates, unparseable } = selectCandidates(items, {
      now: NOW,
      windowHours: 48,
      published: {
        ids: new Set(),
        titles: new Set(['anthropic ships claude opus 5']),
      },
    })

    expect(titles(candidates)).toEqual([
      'Anthropic Ships Claude Opus 5 Today',
      'Flooding displaces thousands in Pakistan',
    ])
    expect(unparseable).toBe(1)
  })

  it('excludes by id as well, and reports the unparseable count from the window', () => {
    const items = [
      item({ title: 'Seen before', id: 'seen', url: 'https://e.com/1' }),
      item({ title: 'Brand new', id: 'new', url: 'https://e.com/2' }),
    ]
    const { candidates, unparseable } = selectCandidates(items, {
      now: NOW,
      windowHours: 48,
      published: { ids: new Set(['seen']), titles: new Set() },
    })
    expect(titles(candidates)).toEqual(['Brand new'])
    expect(unparseable).toBe(0)
  })

  it('returns nothing when every item is out of the window', () => {
    const items = [item({ title: 'A', publishedAt: hoursFromNow(-100) })]
    const { candidates } = selectCandidates(items, {
      now: NOW,
      windowHours: 48,
      published: nothingPublished(),
    })
    expect(candidates).toEqual([])
  })
})
