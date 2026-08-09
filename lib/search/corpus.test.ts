// The index, tested against a corpus written by hand.
//
// Real headlines and real queries. `edition(date, n)` builds "Story number 3"
// with the same description repeated down the list, which can only prove that
// MiniSearch matches a string it was handed a moment ago — it cannot show that
// a reader typing `quant` reaches the quantum story, which is the actual job.
// The placeholder editions do appear once, for the `MAX_HITS` case: that one
// needs more matches than the cap and genuinely does not care what they say.
//
// Ids are twelve hex characters because that is what the pipeline writes — the
// canonical URL, hashed. Ids reading 1, 2, 3 would quietly hide the property
// `buildIndex` rests on: an item's id is unique across the entire archive, so
// one document per item per edition cannot collide.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { edition, item, tempArchive } from '@/app/__fixtures__/archive'
import type { TempArchive } from '@/app/__fixtures__/archive'
import type { Edition, EditionItem } from '../edition'
import { MAX_HITS, archiveIndex, buildIndex, resetIndexForTests, searchNews } from './corpus'
import type { Hit } from './corpus'

const OPUS = '4f9c2a1b8e30'
const QUANTUM = '7b1d6e05aa92'
const ANTITRUST = 'c0e83f47b115'
const CABLE = '2a5f90c3d76e'
const EGRESS = '9d34c7e162fb'

/**
 * An edition around a hand-written list of items.
 *
 * The wrapper is `edition()` so the surrounding fields — `generatedAt`,
 * `summary`, `targetCount` — stay the fixture's business and this file only
 * says what the items are.
 */
function day(date: string, items: EditionItem[]): Edition {
  return { ...edition(date, items.length), items }
}

const NEWEST = day('2026-08-09', [
  item({
    id: OPUS,
    rank: 1,
    title: 'Anthropic ships Claude Opus 5',
    description: 'A wider context window, and a lower price for every token in it.',
    url: 'https://www.anthropic.com/news/opus-5',
    topics: ['models', 'anthropic'],
  }),
  item({
    id: QUANTUM,
    rank: 2,
    title: 'A quantum processor holds its state for a full second',
    description: 'Error correction, not qubit count, is what moved.',
    url: 'https://www.example.com/quantum',
    topics: ['hardware'],
  }),
  item({
    id: ANTITRUST,
    rank: 3,
    title: 'The EU opens an antitrust case against a cloud provider',
    description: 'Regulators want storage and compute sold apart.',
    url: 'https://www.example.com/antitrust',
    topics: ['policy', 'europe'],
  }),
])

const MIDDLE = day('2026-08-08', [
  item({
    id: CABLE,
    rank: 1,
    title: 'An undersea cable is cut in the Red Sea',
    description: 'Three carriers reroute their traffic through Marseille.',
    url: 'https://www.example.com/cable',
    topics: ['infrastructure'],
  }),
  item({
    id: EGRESS,
    rank: 2,
    title: 'A cloud provider raises the price of egress',
    description: 'The second increase this year, and the largest.',
    url: 'https://www.example.com/egress',
    topics: ['infrastructure', 'pricing'],
  }),
])

/** Ten placeholders, one edition further back. Only the `MAX_HITS` case reads them. */
const OLDEST = edition('2026-08-07', 10)

const ARCHIVE = [NEWEST, MIDDLE, OLDEST]

const index = buildIndex(ARCHIVE)

const ids = (hits: readonly Hit[]): string[] => hits.map((hit) => hit.id)

describe('searchNews', () => {
  it('finds an item by a word in its title', () => {
    expect(ids(searchNews(index, 'quantum'))).toEqual([QUANTUM])
  })

  it('finds an item by a word in its description', () => {
    // Marseille is in no title and in no topic. If the description were not
    // indexed this would be empty.
    expect(ids(searchNews(index, 'Marseille'))).toEqual([CABLE])
  })

  it('finds an item by one of its topics', () => {
    // Likewise: the antitrust item is tagged `policy` and the word appears in
    // neither its headline nor its sentence.
    expect(ids(searchNews(index, 'policy'))).toEqual([ANTITRUST])
  })

  it('carries the date the item ran on every hit', () => {
    // The whole point of the field: a citation names the day, and the day is
    // the edition's, not the item's own `publishedAt`.
    const dated = searchNews(index, 'cloud')
      .map((hit) => ({ id: hit.id, date: hit.date }))
      .sort((a, b) => a.id.localeCompare(b.id))

    expect(dated).toEqual([
      { id: EGRESS, date: '2026-08-08' },
      { id: ANTITRUST, date: '2026-08-09' },
    ])
  })

  it('returns nothing for a query the archive does not cover', () => {
    expect(searchNews(index, 'volcano')).toEqual([])
  })

  it('never returns more than MAX_HITS', () => {
    // Ten placeholders all answer to `story`; the model is shown eight.
    expect(searchNews(index, 'story')).toHaveLength(MAX_HITS)
  })

  it('matches a prefix, so a half-typed word still finds its story', () => {
    expect(ids(searchNews(index, 'quant'))).toEqual([QUANTUM])
  })

  it('is not case sensitive', () => {
    expect(ids(searchNews(index, 'ANTHROPIC'))).toEqual([OPUS])
    expect(ids(searchNews(index, 'ANTHROPIC'))).toEqual(ids(searchNews(index, 'anthropic')))
  })

  it('searches every edition, not only the newest', () => {
    // The newest edition is the 9th. The cable ran on the 8th and the
    // placeholders on the 7th, so both are behind it.
    expect(ids(searchNews(index, 'undersea'))).toEqual([CABLE])
    expect(searchNews(index, 'undersea')[0]?.date).toBe('2026-08-08')
    expect(searchNews(index, 'story')[0]?.date).toBe('2026-08-07')
  })

  it('returns an empty array for an empty query rather than everything', () => {
    expect(searchNews(index, '')).toEqual([])
    expect(searchNews(index, '   ')).toEqual([])
  })
})

describe('archiveIndex', () => {
  let archive: TempArchive

  beforeEach(async () => {
    resetIndexForTests()
    archive = await tempArchive()
  })

  afterEach(async () => {
    await archive.drop()
    // The cache outlives the temp directory it was built from, so a leftover
    // index would hand the next test an archive that no longer exists on disk.
    resetIndexForTests()
  })

  it('builds once and hands the same instance back', async () => {
    await archive.put(NEWEST)

    const first = await archiveIndex()
    expect(ids(searchNews(first, 'quantum'))).toEqual([QUANTUM])

    // Written after the first build. A second read of the directory would find
    // it; the cache does not, which is the point.
    await archive.put(MIDDLE)

    const second = await archiveIndex()
    expect(second).toBe(first)
    expect(searchNews(second, 'undersea')).toEqual([])
  })

  it('forgets a build that failed, so one bad edition does not outlive itself', async () => {
    // The duplicate has to be *across* editions, because that is the only way it
    // can happen: a document is an item keyed by the item's own id, and
    // `excludePublished` is what normally stops one story running on two days.
    // When that guarantee breaks, `addAll` throws — inside the very promise the
    // cache is holding.
    await archive.put(NEWEST)
    await archive.put(
      day('2026-08-08', [item({ id: OPUS, title: 'Anthropic ships Claude Opus 5, again' })]),
    )

    await expect(archiveIndex()).rejects.toThrow(/duplicate ID/i)

    // The archive is repaired: a corrected edition lands, and on Vercel that is
    // a fresh deploy — but not necessarily a fresh instance for every reader
    // mid-flight, and not at all in `next dev`, where the same process serves
    // the file before and after it is fixed.
    await archive.put(MIDDLE)

    // The line the fix is about. `??=` assigns on null and undefined only, and a
    // rejected promise is neither — so without the `catch` that clears the slot,
    // this is the *same rejected promise* as above, and every question for the
    // life of the instance gets a 500 sourced from an edition that no longer
    // exists on disk.
    const index = await archiveIndex()
    expect(ids(searchNews(index, 'undersea'))).toEqual([CABLE])
    expect(ids(searchNews(index, 'quantum'))).toEqual([QUANTUM])
  })
})
