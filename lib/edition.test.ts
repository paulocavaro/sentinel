import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  isThin,
  listEditionDates,
  readEdition,
  readLatestEdition,
  themesOf,
} from './edition'
import type { Edition, EditionItem } from './edition'
import { writeEdition } from './ingest/archive'
import { TARGET_COUNT } from './ingest/config'
import type { Edition as PublishedEdition } from './ingest/types'

/**
 * Every test reads from its own temp directory.
 *
 * Nothing here reads `content/days/`. The archive holds exactly two editions
 * today and both will change: a test asserting "the newest edition is the 9th"
 * fails tomorrow morning at 09:23 for a reason that has nothing to do with the
 * reader.
 */
let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sentinel-edition-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const id = (n: number): string => String(n).padStart(12, '0')

function item(over: Partial<EditionItem> = {}): EditionItem {
  return {
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
    ...over,
  }
}

function edition(over: Partial<Edition> = {}): Edition {
  return {
    date: '2026-08-08',
    generatedAt: '2026-08-08T09:23:00.000Z',
    summary: 'A quiet day, with one model release worth reading about.',
    targetCount: 20,
    items: [item({ theme: 'ai' })],
    ...over,
  }
}

/**
 * Written by hand rather than through `writeEdition`, because the pre-theme
 * editions this reader has to survive cannot be expressed in the pipeline's
 * `Edition` type at all — its `Item.theme` is required. One test below does go
 * through `writeEdition`, to prove the reader reads what the pipeline writes.
 */
async function write(at: string, value: unknown): Promise<void> {
  await writeFile(join(dir, `${at}.json`), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

// ---------------------------------------------------------------------------
// listEditionDates
// ---------------------------------------------------------------------------

describe('listEditionDates', () => {
  it('returns the dates newest first', async () => {
    await write('2026-08-06', edition({ date: '2026-08-06' }))
    await write('2026-08-09', edition({ date: '2026-08-09' }))
    await write('2026-08-07', edition({ date: '2026-08-07' }))

    expect(await listEditionDates(dir)).toEqual(['2026-08-09', '2026-08-07', '2026-08-06'])
  })

  it('is empty when the directory does not exist', async () => {
    // A fresh clone before the first ingest. Not an error.
    expect(await listEditionDates(join(dir, 'never-created'))).toEqual([])
  })

  it('skips a corrupt file instead of throwing, and still lists the rest', async () => {
    await write('2026-08-06', edition({ date: '2026-08-06' }))
    await writeFile(join(dir, '2026-08-07.json'), '{ not json at all', 'utf8')
    await write('2026-08-08', edition({ date: '2026-08-08' }))

    expect(await listEditionDates(dir)).toEqual(['2026-08-08', '2026-08-06'])
  })

  it('skips a file that parses but is not an edition', async () => {
    await write('2026-08-06', edition({ date: '2026-08-06' }))
    await write('2026-08-07', { items: 'not an array' })
    await write('2026-08-08', [1, 2, 3])
    await write('2026-08-09', edition({ date: '2026-08-09', items: [] }))

    expect(await listEditionDates(dir)).toEqual(['2026-08-06'])
  })

  it('ignores anything that is not a dated edition file', async () => {
    await write('2026-08-06', edition({ date: '2026-08-06' }))
    await writeFile(join(dir, 'README.md'), '# not an edition', 'utf8')
    await writeFile(join(dir, 'index.json'), JSON.stringify(edition()), 'utf8')
    await mkdir(join(dir, 'nested'))

    expect(await listEditionDates(dir)).toEqual(['2026-08-06'])
  })

  it('skips a file whose date disagrees with its name', async () => {
    // The name is the URL. A record that answers to two dates would print one
    // date in the masthead and the other in the edition bar's link to itself.
    await write('2026-08-06', edition({ date: '2026-08-06' }))
    await write('2026-08-07', edition({ date: '1999-01-01' }))

    expect(await listEditionDates(dir)).toEqual(['2026-08-06'])
  })
})

// ---------------------------------------------------------------------------
// readEdition
// ---------------------------------------------------------------------------

describe('readEdition', () => {
  it('returns null for a date with no file', async () => {
    await write('2026-08-08', edition())

    expect(await readEdition('2026-08-07', dir)).toBeNull()
  })

  it('returns null when the directory does not exist', async () => {
    expect(await readEdition('2026-08-08', join(dir, 'never-created'))).toBeNull()
  })

  it('returns null for a corrupt file rather than throwing', async () => {
    await writeFile(join(dir, '2026-08-08.json'), '{ not json at all', 'utf8')

    expect(await readEdition('2026-08-08', dir)).toBeNull()
  })

  it('returns null for a segment that is not a calendar date, without touching the disk', async () => {
    // `readEdition` is reached from a route segment. A date that is not a date
    // must not become a path.
    expect(await readEdition('../../package', dir)).toBeNull()
    expect(await readEdition('banana', dir)).toBeNull()
    expect(await readEdition('', dir)).toBeNull()
  })

  it('reads the edition back whole', async () => {
    const written = edition()
    await write('2026-08-08', written)

    expect(await readEdition('2026-08-08', dir)).toEqual(written)
  })

  it('reads an edition whose items carry no theme', async () => {
    // The 8 August edition predates the field. A reader that required it would
    // report the archive as corrupt.
    const pre = edition({ items: [item({ id: id(1) }), item({ id: id(2), rank: 2 })] })
    await write('2026-08-08', pre)

    const read = await readEdition('2026-08-08', dir)

    expect(read?.items).toHaveLength(2)
    expect(read?.items[0].theme).toBeUndefined()
  })

  it('reads what the pipeline writes', async () => {
    // The producer is `lib/ingest/archive.ts`. If the two ever disagree about
    // the shape on disk, it should fail here rather than on the front page.
    const published: PublishedEdition = {
      date: '2026-08-08',
      generatedAt: '2026-08-08T09:23:00.000Z',
      summary: 'A quiet day.',
      targetCount: 20,
      items: [{ ...item(), theme: 'ai' }],
    }
    await writeEdition(dir, published)

    expect(await readEdition('2026-08-08', dir)).toEqual(published)
  })
})

// ---------------------------------------------------------------------------
// readLatestEdition
// ---------------------------------------------------------------------------

describe('readLatestEdition', () => {
  it('returns the newest edition', async () => {
    await write('2026-08-06', edition({ date: '2026-08-06', summary: 'Older.' }))
    await write('2026-08-09', edition({ date: '2026-08-09', summary: 'Newest.' }))
    await write('2026-08-07', edition({ date: '2026-08-07', summary: 'Middle.' }))

    const latest = await readLatestEdition(dir)

    expect(latest?.date).toBe('2026-08-09')
    expect(latest?.summary).toBe('Newest.')
  })

  it('returns null on an empty directory', async () => {
    // Reachable on a fresh clone and before the first ingest. A non-nullable
    // return would be a lie, and the home route would crash on it.
    expect(await readLatestEdition(dir)).toBeNull()
  })

  it('returns null when the directory does not exist', async () => {
    expect(await readLatestEdition(join(dir, 'never-created'))).toBeNull()
  })

  it('skips past a corrupt newest file to the newest readable one', async () => {
    await write('2026-08-06', edition({ date: '2026-08-06' }))
    await writeFile(join(dir, '2026-08-09.json'), '{ not json at all', 'utf8')

    expect((await readLatestEdition(dir))?.date).toBe('2026-08-06')
  })
})

// ---------------------------------------------------------------------------
// themesOf
// ---------------------------------------------------------------------------

describe('themesOf', () => {
  it('is empty when no item carries a theme', async () => {
    // `content/days/2026-08-08.json` is exactly this: twenty items, no field.
    // It must render as one ungrouped list, not as five empty sections.
    const pre = edition({ items: [item({ id: id(1) }), item({ id: id(2) })] })

    expect(themesOf(pre)).toEqual([])
  })

  it('returns the themes present, in the canonical order, not order of appearance', () => {
    const mixed = edition({
      items: [
        item({ id: id(1), theme: 'culture' }),
        item({ id: id(2), theme: 'games' }),
        item({ id: id(3), theme: 'ai' }),
        item({ id: id(4), theme: 'games' }),
      ],
    })

    // config.ts's order — ai, world, games, science, culture — not culture first.
    expect(themesOf(mixed)).toEqual(['ai', 'games', 'culture'])
  })

  it('names no theme the edition does not carry', () => {
    const only = edition({ items: [item({ theme: 'science' })] })

    expect(themesOf(only)).toEqual(['science'])
  })

  it('ignores items with no theme in an edition that has some', () => {
    const partial = edition({
      items: [item({ id: id(1), theme: 'world' }), item({ id: id(2) })],
    })

    expect(themesOf(partial)).toEqual(['world'])
  })
})

// ---------------------------------------------------------------------------
// isThin
// ---------------------------------------------------------------------------

describe('isThin', () => {
  it('reads the edition’s own targetCount, never the pipeline constant', () => {
    // The premise, asserted so this test explains itself when it breaks: the
    // 8 August edition is complete at twenty items, and the constant is thirty.
    expect(TARGET_COUNT).toBe(30)

    const complete = edition({
      targetCount: 20,
      items: Array.from({ length: 20 }, (_, n) => item({ id: id(n + 1), rank: n + 1 })),
    })

    expect(complete.targetCount).not.toBe(TARGET_COUNT)
    // Against the constant this reads 20 < 30 and calls a complete edition thin.
    expect(isThin(complete)).toBe(false)
  })

  it('is true when the edition fell short of the count it was built against', () => {
    const short = edition({
      targetCount: 30,
      items: Array.from({ length: 17 }, (_, n) => item({ id: id(n + 1), rank: n + 1 })),
    })

    expect(isThin(short)).toBe(true)
  })

  it('is false for an edition that reached its count', () => {
    const full = edition({
      targetCount: 30,
      items: Array.from({ length: 30 }, (_, n) => item({ id: id(n + 1), rank: n + 1 })),
    })

    expect(isThin(full)).toBe(false)
  })
})
