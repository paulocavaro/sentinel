import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildEdition, editionExists, readPublished, writeEdition } from './archive'
import type { BuildEditionOptions } from './archive'
import type { Curation } from './curate'
import { normalizeTitle } from './select'
import type { Edition, RawItem } from './types'

/**
 * Every test in this file touches the filesystem, so every test gets its own
 * directory under the OS temp dir. Nothing here ever writes inside the
 * repository: an archive test that wrote to `content/days/` would leave a real
 * edition behind and publish it on the next commit.
 */
let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sentinel-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const id = (n: number): string => String(n).padStart(12, '0')

function candidate(over: Partial<RawItem> = {}): RawItem {
  return {
    id: id(1),
    title: 'Anthropic ships Claude Opus 5',
    summary: 'A sanitized feed summary.',
    url: 'https://e.com/1',
    imageUrl: 'https://e.com/1.jpg',
    source: { id: 's1', name: 'Source One', kind: 'press', priority: 1 },
    lane: 'ai',
    publishedAt: '2026-08-07T10:00:00.000Z',
    ...over,
  }
}

function edition(over: Partial<Edition> = {}): Edition {
  return {
    date: '2026-08-08',
    generatedAt: '2026-08-08T09:23:00.000Z',
    summary: 'A quiet day, with one model release worth reading about.',
    targetCount: 20,
    items: [
      {
        id: id(1),
        rank: 1,
        title: 'Anthropic ships Claude Opus 5',
        description: 'Why this matters, in one plain sentence.',
        url: 'https://e.com/1',
        image: '/img/000000000001.webp',
        publisher: 'E',
        feed: { name: 'Source One', kind: 'press' },
        publishedAt: '2026-08-07T10:00:00.000Z',
        topics: ['models'],
      },
    ],
    ...over,
  }
}

const opts = (over: Partial<BuildEditionOptions> = {}): BuildEditionOptions => ({
  date: '2026-08-08',
  generatedAt: '2026-08-08T09:23:00.000Z',
  targetCount: 20,
  images: new Map(),
  ...over,
})

// ---------------------------------------------------------------------------
// readPublished
// ---------------------------------------------------------------------------

describe('readPublished', () => {
  it('returns an empty index when the directory does not exist', async () => {
    const published = await readPublished(join(dir, 'never-created'))

    expect(published.ids.size).toBe(0)
    expect(published.titles.size).toBe(0)
  })

  it('collects ids across every edition file', async () => {
    await writeEdition(dir, edition({ date: '2026-08-07' }))
    await writeEdition(
      dir,
      edition({
        date: '2026-08-08',
        items: [{ ...edition().items[0], id: id(2), title: 'A second story' }],
      }),
    )

    const published = await readPublished(dir)

    expect(published.ids).toEqual(new Set([id(1), id(2)]))
  })

  it('collects titles normalized, because that is what exclusion compares against', async () => {
    await writeEdition(
      dir,
      edition({
        items: [{ ...edition().items[0], title: 'AT&T’s Big Plan — Part 2' }],
      }),
    )

    const published = await readPublished(dir)

    expect(published.titles.has(normalizeTitle('AT&T’s Big Plan — Part 2'))).toBe(true)
    // Stored normalized, not verbatim: a title read back out must match the
    // same story arriving tomorrow with different punctuation or casing.
    expect(published.titles.has('AT&T’s Big Plan — Part 2')).toBe(false)
    expect(published.titles.has(normalizeTitle('at&t’s BIG plan, part 2'))).toBe(true)
  })

  it('collects titles across every edition file', async () => {
    await writeEdition(dir, edition({ date: '2026-08-07' }))
    await writeEdition(
      dir,
      edition({
        date: '2026-08-08',
        items: [{ ...edition().items[0], id: id(2), title: 'A second story' }],
      }),
    )

    const published = await readPublished(dir)

    expect(published.titles).toEqual(
      new Set([normalizeTitle('Anthropic ships Claude Opus 5'), normalizeTitle('A second story')]),
    )
  })

  it('skips an unparseable edition file instead of throwing', async () => {
    await writeEdition(dir, edition({ date: '2026-08-07' }))
    await writeFile(join(dir, '2026-08-08.json'), '{ not json at all', 'utf8')

    const published = await readPublished(dir)

    expect(published.ids).toEqual(new Set([id(1)]))
  })

  it('skips a file that parses but is not an edition', async () => {
    await writeEdition(dir, edition({ date: '2026-08-07' }))
    await writeFile(join(dir, '2026-08-08.json'), JSON.stringify({ items: 'not an array' }), 'utf8')
    await writeFile(join(dir, '2026-08-09.json'), JSON.stringify([1, 2, 3]), 'utf8')

    const published = await readPublished(dir)

    expect(published.ids).toEqual(new Set([id(1)]))
    expect(published.titles.size).toBe(1)
  })

  it('ignores files that are not editions at all', async () => {
    await writeEdition(dir, edition({ date: '2026-08-07' }))
    await writeFile(join(dir, 'README.md'), '# not an edition', 'utf8')
    await mkdir(join(dir, 'nested'))

    const published = await readPublished(dir)

    expect(published.ids).toEqual(new Set([id(1)]))
  })

  it('skips an item whose id or title is missing rather than storing undefined', async () => {
    await writeFile(
      join(dir, '2026-08-07.json'),
      JSON.stringify({ items: [{ id: id(1) }, { title: 'No id here' }, { id: id(2), title: 'Both' }] }),
      'utf8',
    )

    const published = await readPublished(dir)

    expect(published.ids).toEqual(new Set([id(2)]))
    expect(published.titles).toEqual(new Set([normalizeTitle('Both')]))
  })
})

// ---------------------------------------------------------------------------
// editionExists
// ---------------------------------------------------------------------------

describe('editionExists', () => {
  it('is false before the edition is written and true after', async () => {
    expect(await editionExists(dir, '2026-08-08')).toBe(false)

    await writeEdition(dir, edition({ date: '2026-08-08' }))

    expect(await editionExists(dir, '2026-08-08')).toBe(true)
  })

  it('is false for a different date, and false when the directory is missing', async () => {
    await writeEdition(dir, edition({ date: '2026-08-08' }))

    expect(await editionExists(dir, '2026-08-07')).toBe(false)
    expect(await editionExists(join(dir, 'never-created'), '2026-08-08')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// buildEdition
// ---------------------------------------------------------------------------

describe('buildEdition', () => {
  it('orders items by rank regardless of the order the model returned them in', () => {
    const pool = [
      candidate({ id: id(1), url: 'https://e.com/1' }),
      candidate({ id: id(2), url: 'https://e.com/2' }),
      candidate({ id: id(3), url: 'https://e.com/3' }),
    ]
    const curation: Curation = {
      summary: 'A day.',
      items: [
        { id: id(3), rank: 3, description: 'Third.', topics: ['a'] },
        { id: id(1), rank: 1, description: 'First.', topics: ['a'] },
        { id: id(2), rank: 2, description: 'Second.', topics: ['a'] },
      ],
    }

    const built = buildEdition(curation, pool, opts())

    expect(built.items.map((item) => item.rank)).toEqual([1, 2, 3])
    expect(built.items.map((item) => item.id)).toEqual([id(1), id(2), id(3)])
  })

  it('carries the local image path when there is one and null when there is not', () => {
    const pool = [
      candidate({ id: id(1), url: 'https://e.com/1' }),
      candidate({ id: id(2), url: 'https://e.com/2' }),
    ]
    const curation: Curation = {
      summary: 'A day.',
      items: [
        { id: id(1), rank: 1, description: 'First.', topics: ['a'] },
        { id: id(2), rank: 2, description: 'Second.', topics: ['a'] },
      ],
    }

    // The map is what Task 8's downloadImages returns: id → public path, with
    // the misses simply absent. An absent entry is a designed state.
    const images = new Map([[id(1), '/img/000000000001.webp']])

    const built = buildEdition(curation, pool, opts({ images }))

    expect(built.items[0].image).toBe('/img/000000000001.webp')
    expect(built.items[1].image).toBeNull()
  })

  it('records targetCount even when the edition is short', () => {
    const pool = [candidate()]
    const curation: Curation = {
      summary: 'A thin day.',
      items: [{ id: id(1), rank: 1, description: 'Only one.', topics: ['a'] }],
    }

    const built = buildEdition(curation, pool, opts({ targetCount: 20 }))

    expect(built.items).toHaveLength(1)
    expect(built.targetCount).toBe(20)
  })

  it('takes title, url, feed and publishedAt from the candidate, never from the model', () => {
    const pool = [
      candidate({
        id: id(1),
        title: 'The real headline',
        url: 'https://www.theverge.com/real',
        source: { id: 's1', name: 'The Real Feed', kind: 'blog', priority: 2 },
        publishedAt: '2026-08-07T10:00:00.000Z',
      }),
    ]
    // A curation carrying fields it was never asked for. They must not appear.
    const curation = {
      summary: 'A day.',
      items: [
        {
          id: id(1),
          rank: 1,
          description: 'Why it matters.',
          topics: ['models'],
          title: 'A FORGED HEADLINE',
          url: 'https://evil.com/phish',
          publisher: 'Evil',
          feed: { name: 'Evil', kind: 'press' },
          publishedAt: '1999-01-01T00:00:00.000Z',
        },
      ],
    } as unknown as Curation

    const built = buildEdition(curation, pool, opts())
    const item = built.items[0]

    expect(item.title).toBe('The real headline')
    expect(item.url).toBe('https://www.theverge.com/real')
    expect(item.publisher).toBe('The Verge')
    expect(item.feed).toEqual({ name: 'The Real Feed', kind: 'blog' })
    expect(item.publishedAt).toBe('2026-08-07T10:00:00.000Z')
    // The model authors only these three.
    expect(item.description).toBe('Why it matters.')
    expect(item.topics).toEqual(['models'])
    expect(item.rank).toBe(1)
  })

  it('bylines the publisher of the article, not the feed that found it', () => {
    // The real shape of the bug: Hacker News is a discovery channel, and seven
    // of the first edition's twenty items were bylined with it while opening on
    // somebody else's site. The feed is still on the item, as provenance.
    const pool = [
      candidate({
        id: id(1),
        url: 'https://www.reuters.com/business/retail-consumer/alibaba-plans',
        source: { id: 'hn', name: 'Hacker News', kind: 'forum', priority: 9 },
      }),
    ]
    const curation: Curation = {
      summary: 'A day.',
      items: [{ id: id(1), rank: 1, description: 'Found on HN, published by Reuters.', topics: ['a'] }],
    }

    const item = buildEdition(curation, pool, opts()).items[0]

    expect(item.publisher).toBe('Reuters')
    expect(item.feed).toEqual({ name: 'Hacker News', kind: 'forum' })
  })

  it('derives the publisher for every item, whatever the feed', () => {
    const pool = [
      candidate({ id: id(1), url: 'https://deepmind.google/blog/weathernext' }),
      candidate({ id: id(2), url: 'https://app.dealroom.co/news/feed/oracle-bans' }),
      candidate({
        id: id(3),
        url: 'https://www.bbc.co.uk/news/articles/cewr898jy8go',
        source: { id: 'bbc-world', name: 'BBC World', kind: 'press', priority: 2 },
      }),
    ]
    const curation: Curation = {
      summary: 'A day.',
      items: [
        { id: id(1), rank: 1, description: 'One.', topics: ['a'] },
        { id: id(2), rank: 2, description: 'Two.', topics: ['a'] },
        { id: id(3), rank: 3, description: 'Three.', topics: ['a'] },
      ],
    }

    const built = buildEdition(curation, pool, opts())

    // Including the section feeds: "BBC World" is a section, "BBC" is the outlet.
    expect(built.items.map((item) => item.publisher)).toEqual(['Google DeepMind', 'Dealroom', 'BBC'])
  })

  it('carries the date, generatedAt and summary through', () => {
    const pool = [candidate()]
    const curation: Curation = {
      summary: 'A quiet day.',
      items: [{ id: id(1), rank: 1, description: 'One.', topics: ['a'] }],
    }

    const built = buildEdition(
      curation,
      pool,
      opts({ date: '2026-08-08', generatedAt: '2026-08-08T09:23:00.000Z' }),
    )

    expect(built.date).toBe('2026-08-08')
    expect(built.generatedAt).toBe('2026-08-08T09:23:00.000Z')
    expect(built.summary).toBe('A quiet day.')
  })

  it('throws when a curated id has no candidate, rather than producing undefined.title', () => {
    const pool = [candidate({ id: id(1) })]
    const curation: Curation = {
      summary: 'A day.',
      items: [
        { id: id(1), rank: 1, description: 'First.', topics: ['a'] },
        { id: 'ffffffffffff', rank: 2, description: 'Invented.', topics: ['a'] },
      ],
    }

    expect(() => buildEdition(curation, pool, opts())).toThrow(/ffffffffffff/)
  })
})

// ---------------------------------------------------------------------------
// writeEdition
// ---------------------------------------------------------------------------

describe('writeEdition', () => {
  it('round-trips: what is read back parses to exactly what was written', async () => {
    const written = edition()

    await writeEdition(dir, written)
    const raw = await readFile(join(dir, '2026-08-08.json'), 'utf8')

    expect(JSON.parse(raw)).toEqual(written)
  })

  it('creates the directory when it does not exist', async () => {
    const nested = join(dir, 'content', 'days')

    await writeEdition(nested, edition())

    expect(JSON.parse(await readFile(join(nested, '2026-08-08.json'), 'utf8'))).toEqual(edition())
  })

  it('writes two-space JSON with a trailing newline, because humans read the diff', async () => {
    await writeEdition(dir, edition())
    const raw = await readFile(join(dir, '2026-08-08.json'), 'utf8')

    expect(raw.endsWith('\n')).toBe(true)
    expect(raw).toContain('\n  "date": "2026-08-08"')
    expect(raw.split('\n').length).toBeGreaterThan(5)
  })

  it('overwrites an existing edition for the same date', async () => {
    await writeEdition(dir, edition({ summary: 'First pass.' }))
    await writeEdition(dir, edition({ summary: 'Second pass.' }))

    const raw = await readFile(join(dir, '2026-08-08.json'), 'utf8')
    expect(JSON.parse(raw).summary).toBe('Second pass.')
  })

  it('writes what readPublished then reads back', async () => {
    await writeEdition(dir, edition())

    const published = await readPublished(dir)

    expect(published.ids.has(id(1))).toBe(true)
    expect(published.titles.has(normalizeTitle('Anthropic ships Claude Opus 5'))).toBe(true)
  })
})
