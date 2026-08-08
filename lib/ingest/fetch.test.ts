import { describe, expect, it, vi } from 'vitest'
import { collect } from './fetch'
import type { Source } from './types'

const rss = `<rss><channel><item><title>A</title><link>https://a.com/1</link>
  <pubDate>Fri, 07 Aug 2026 10:00:00 GMT</pubDate></item></channel></rss>`

const sources: Source[] = [
  { id: 'a', name: 'A', kind: 'press', format: 'rss', lane: 'ai', url: 'https://a.com/f', priority: 1 },
  { id: 'b', name: 'B', kind: 'press', format: 'rss', lane: 'world', url: 'https://b.com/f', priority: 2 },
]
const opts = { since: new Date('2026-08-06T09:00:00Z'), concurrency: 4 }

describe('collect', () => {
  it('fetches every source', async () => {
    const fetcher = vi.fn(async () => rss)
    await collect(sources, fetcher, opts)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('keeps going when one source fails, and reports it', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes('b.com')) throw new Error('boom')
      return rss
    })
    const { items, failures } = await collect(sources, fetcher, opts)
    expect(items.length).toBeGreaterThan(0)
    expect(failures).toEqual(['b'])
  })

  it('reports a failure when a source returns nothing parseable', async () => {
    const { items, failures } = await collect(sources, async () => 'garbage', opts)
    expect(items).toEqual([])
    expect(failures).toHaveLength(2)
  })

  it('tags each item with its source lane and priority', async () => {
    const { items } = await collect(sources, async () => rss, opts)
    expect(items.some((i) => i.lane === 'world')).toBe(true)
    expect(items[0].source.priority).toBe(1)
  })
})
