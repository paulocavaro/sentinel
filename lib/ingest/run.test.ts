import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_SOURCE_FAILURES, TARGET_COUNT, WORLD_MIN } from './config'
import type { Curation } from './curate'
import { runIngest } from './run'
import type { IngestDeps } from './run'
import type { Edition, Source } from './types'

/**
 * The orchestrator's contract, end to end, with nothing real behind it.
 *
 * Every boundary is injected — the feed reader, the model, the article reader,
 * the image reader, the clock and both directories — so this suite opens no
 * socket, needs no API key, and writes nothing outside a temp directory. That is
 * not only hygiene: the claims being made here are *"a failed validation writes
 * nothing"* and *"a second run of the day does not call the model"*, and both are
 * only believable if the test can prove them by reading the directories back and
 * counting the calls.
 */

const NOW = new Date('2026-08-08T09:00:00.000Z')
const DATE = '2026-08-08'

/** Inside the 48h window, and stamped in the RFC-822 form feeds actually use. */
const PUB_DATE = 'Sat, 08 Aug 2026 06:00:00 GMT'

const STALE_SUMMARY = 'A stale edition written by an earlier run.'

/** A 1×1 PNG. Real bytes, so `sharp` has something it can genuinely decode. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

// ---------------------------------------------------------------------------
// A miniature source registry
// ---------------------------------------------------------------------------

/**
 * The three `spare` sources come first on purpose: the source-failure tests kill
 * `SOURCES.slice(0, MAX_SOURCE_FAILURES)` and `slice(0, MAX_SOURCE_FAILURES + 1)`
 * respectively, so they stay correct if the tolerance in `config.ts` changes
 * rather than silently testing the wrong boundary.
 *
 * `world1` carries no images in its feed, which is what makes the image test
 * able to tell the two network paths apart: an article page is only read for an
 * item whose feed had no picture.
 */
const SOURCES: Source[] = [
  { id: 'spare1', name: 'Spare One', kind: 'blog', format: 'rss', lane: 'ai', url: 'https://spare1.example.com/feed', priority: 3 },
  { id: 'spare2', name: 'Spare Two', kind: 'blog', format: 'rss', lane: 'ai', url: 'https://spare2.example.com/feed', priority: 3 },
  { id: 'spare3', name: 'Spare Three', kind: 'blog', format: 'rss', lane: 'ai', url: 'https://spare3.example.com/feed', priority: 3 },
  { id: 'ai1', name: 'Outlet One', kind: 'press', format: 'rss', lane: 'ai', url: 'https://ai1.example.com/feed', priority: 1 },
  { id: 'ai2', name: 'Outlet Two', kind: 'press', format: 'rss', lane: 'ai', url: 'https://ai2.example.com/feed', priority: 2 },
  { id: 'world1', name: 'World Desk', kind: 'press', format: 'rss', lane: 'world', url: 'https://world1.example.com/feed', priority: 2 },
]

const DEFAULT_COUNTS: Record<string, number> = {
  spare1: 2,
  spare2: 2,
  spare3: 2,
  ai1: 12,
  ai2: 12,
  world1: 6,
}

/** Sources whose feed carries a picture. `world1` deliberately does not. */
const WITH_IMAGE = new Set(['spare1', 'spare2', 'spare3', 'ai1', 'ai2'])

function feed(sourceId: string, count: number): string {
  const items = Array.from({ length: count }, (_, index) => {
    const n = index + 1
    const enclosure = WITH_IMAGE.has(sourceId)
      ? `<enclosure url="https://img.example.com/${sourceId}-${n}.jpg" type="image/jpeg"/>`
      : ''

    return [
      '<item>',
      `<title>${sourceId} headline number ${n}</title>`,
      `<link>https://${sourceId}.example.com/${n}</link>`,
      `<description>What happened in ${sourceId} story ${n}, in one line.</description>`,
      `<pubDate>${PUB_DATE}</pubDate>`,
      enclosure,
      '</item>',
    ].join('')
  }).join('')

  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${sourceId}</title>${items}</channel></rss>`
}

type FetcherOptions = {
  counts?: Record<string, number>
  /** Source ids whose request rejects, as a dead host would. */
  failing?: readonly string[]
}

function makeFetcher({ counts = {}, failing = [] }: FetcherOptions = {}) {
  return vi.fn(async (url: string): Promise<string> => {
    const source = SOURCES.find((candidate) => url.startsWith(candidate.url))
    if (!source) throw new Error(`the test fetcher was asked for an unknown url: ${url}`)
    if (failing.includes(source.id)) throw new Error(`${source.id} is down`)

    return feed(source.id, counts[source.id] ?? DEFAULT_COUNTS[source.id])
  })
}

// ---------------------------------------------------------------------------
// A stand-in for the model
// ---------------------------------------------------------------------------

const OPEN = '<candidates>'
const CLOSE = '</candidates>'

/** The candidate block, read back out of the prompt exactly as the model sees it. */
function candidatesInPrompt(prompt: string): Array<{ id: string; lane: string }> {
  const open = prompt.indexOf(OPEN)
  const close = prompt.indexOf(CLOSE)
  expect(open).toBeGreaterThanOrEqual(0)
  expect(close).toBeGreaterThan(open)

  return JSON.parse(prompt.slice(open + OPEN.length, close)) as Array<{ id: string; lane: string }>
}

/**
 * A generator that plays by the rules: it reads the candidates out of the
 * prompt and returns a curation that satisfies every constraint validation
 * enforces. `mutate` is how a test breaks exactly one of them.
 */
function makeGenerator(mutate: (curation: Curation) => Curation = (curation) => curation) {
  return vi.fn(async (prompt: string): Promise<Curation> => {
    const all = candidatesInPrompt(prompt)
    const world = all.filter((candidate) => candidate.lane === 'world').slice(0, WORLD_MIN)
    const ai = all
      .filter((candidate) => candidate.lane === 'ai')
      .slice(0, TARGET_COUNT - world.length)

    return mutate({
      summary: 'A quiet day, with one model release worth reading about.',
      items: [...world, ...ai].map((candidate, index) => ({
        id: candidate.id,
        rank: index + 1,
        description: 'Why this matters, in one plain sentence.',
        topics: ['models'],
      })),
    })
  })
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let root: string
let contentDir: string
let imageDir: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sentinel-run-'))
  contentDir = join(root, 'content')
  imageDir = join(root, 'img')
  await mkdir(contentDir)
  await mkdir(imageDir)
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

/**
 * Defaults that fail loudly. Both image readers reject unless a test supplies
 * one, because a missing image is a designed state of the edition and a test
 * that accidentally hit the network would otherwise look identical to one that
 * did not.
 */
function deps(over: Partial<IngestDeps> = {}): IngestDeps {
  return {
    fetcher: makeFetcher(),
    generate: makeGenerator(),
    fetchHtml: vi.fn(async (): Promise<string> => {
      throw new Error('no article page available')
    }),
    fetchImage: vi.fn(async (): Promise<Buffer> => {
      throw new Error('no image available')
    }),
    now: () => NOW,
    contentDir,
    imageDir,
    sources: SOURCES,
    ...over,
  }
}

/** An edition already on disk for today, from a previous run. */
async function writeStaleEdition(): Promise<void> {
  const stale: Edition = {
    date: DATE,
    generatedAt: '2026-08-08T05:00:00.000Z',
    summary: STALE_SUMMARY,
    targetCount: TARGET_COUNT,
    items: [
      {
        id: 'ffffffffffff',
        rank: 1,
        title: 'Something else entirely, from an earlier run',
        description: 'A line written by a previous run.',
        url: 'https://stale.example.com/1',
        image: null,
        source: { name: 'Stale Wire', kind: 'press' },
        publishedAt: '2026-08-07T10:00:00.000Z',
        topics: ['archive'],
      },
    ],
  }

  await writeFile(join(contentDir, `${DATE}.json`), `${JSON.stringify(stale, null, 2)}\n`, 'utf8')
}

async function readEdition(): Promise<Edition> {
  return JSON.parse(await readFile(join(contentDir, `${DATE}.json`), 'utf8')) as Edition
}

/** Proof, not inference: read both directories back off the disk. */
async function nothingWritten(): Promise<void> {
  expect(await readdir(contentDir)).toEqual([])
  expect(await readdir(imageDir)).toEqual([])
}

// ---------------------------------------------------------------------------

describe('runIngest', () => {
  // -------------------------------------------------------------------------
  // Idempotence
  // -------------------------------------------------------------------------

  it('returns early, and never calls the generator, when today’s edition exists', async () => {
    await writeStaleEdition()

    const generate = makeGenerator()
    const fetcher = makeFetcher()
    const result = await runIngest(deps({ generate, fetcher }))

    expect(result.code).toBe(0)
    expect(result.wrote).toBe(false)

    // The whole point of the check. A retried job, a double-triggered schedule
    // or an operator running the script twice must not spend a model call.
    expect(generate).not.toHaveBeenCalled()
    expect(fetcher).not.toHaveBeenCalled()

    // And the edition on disk is untouched.
    expect((await readEdition()).summary).toBe(STALE_SUMMARY)
  })

  it('proceeds and overwrites when force is set', async () => {
    await writeStaleEdition()

    const generate = makeGenerator()
    const result = await runIngest(deps({ generate }), { force: true })

    expect(result.code).toBe(0)
    expect(result.wrote).toBe(true)
    expect(generate).toHaveBeenCalledTimes(1)

    const written = await readEdition()
    expect(written.summary).not.toBe(STALE_SUMMARY)
    expect(written.items).toHaveLength(TARGET_COUNT)
  })

  // -------------------------------------------------------------------------
  // The failure paths — every one of them writes nothing
  // -------------------------------------------------------------------------

  it('aborts and writes nothing when validation fails', async () => {
    // A curation that is structurally perfect and editorially unpublishable: a
    // model-authored description carrying a link, straight onto a public page.
    //
    // The failure is deliberately one that ONLY `validateCuration` can catch.
    // An invented id would also abort the run, but `buildEdition` throws on it
    // too, so that test would still pass with the validation gate deleted. This
    // one assembles and writes cleanly if the gate is not there.
    const generate = makeGenerator((curation) => ({
      ...curation,
      items: curation.items.map((item, index) =>
        index === 0 ? { ...item, description: 'The write-up is at https://evil.example/pwn.' } : item,
      ),
    }))

    // A working image reader, so that images downloaded before the gate would
    // leave real files behind and be caught by the directory check below.
    const fetchImage = vi.fn(async () => PNG)

    const result = await runIngest(deps({ generate, fetchImage }))

    expect(result.code).toBe(1)
    expect(result.wrote).toBe(false)
    expect(result.reasons.length).toBeGreaterThan(0)
    expect(result.reasons.some((reason) => /link or markup/i.test(reason))).toBe(true)

    // The single most important claim in the phase: yesterday's edition is still
    // the live one, and no orphan image was left behind either.
    expect(fetchImage).not.toHaveBeenCalled()
    await nothingWritten()
  })

  it('aborts and writes nothing when the model invents an id', async () => {
    const generate = makeGenerator((curation) => ({
      ...curation,
      items: curation.items.map((item, index) =>
        index === 0 ? { ...item, id: 'ffffffffffff' } : item,
      ),
    }))

    const result = await runIngest(deps({ generate }))

    expect(result.code).toBe(1)
    expect(result.wrote).toBe(false)
    expect(result.reasons.some((reason) => reason.includes('ffffffffffff'))).toBe(true)
    await nothingWritten()
  })

  it('aborts when the curation call fails even after its retry', async () => {
    const generate = vi.fn(async (): Promise<Curation> => {
      throw new Error('529 overloaded')
    })

    const result = await runIngest(deps({ generate }))

    expect(result.code).toBe(1)
    expect(result.wrote).toBe(false)
    expect(result.reasons.length).toBeGreaterThan(0)
    // Once, then the retry. Not a third time.
    expect(generate).toHaveBeenCalledTimes(2)
    await nothingWritten()
  })

  it('aborts when more sources fail than the run tolerates', async () => {
    const failing = SOURCES.slice(0, MAX_SOURCE_FAILURES + 1).map((source) => source.id)
    const generate = makeGenerator()

    const result = await runIngest(deps({ fetcher: makeFetcher({ failing }), generate }))

    expect(result.code).toBe(1)
    expect(result.wrote).toBe(false)
    expect(result.reasons.length).toBeGreaterThan(0)
    // The list reaches the caller, so the job summary can name the dead sources.
    expect(result.failures).toEqual(failing)
    expect(generate).not.toHaveBeenCalled()
    await nothingWritten()
  })

  it('tolerates exactly the permitted number of source failures', async () => {
    // The other side of the boundary, so `>` cannot quietly become `>=`. A feed
    // 404ing, or Hacker News having a quiet hour, must not cost the edition.
    const failing = SOURCES.slice(0, MAX_SOURCE_FAILURES).map((source) => source.id)

    const result = await runIngest(deps({ fetcher: makeFetcher({ failing }) }))

    expect(result.code).toBe(0)
    expect(result.wrote).toBe(true)
    expect(result.failures).toEqual(failing)
  })

  it('turns an unexpected failure into a reason and a non-zero code, never a throw', async () => {
    // A disk error at the very last step, past every guard the pipeline has.
    // `runIngest` is called by a thin script whose only job is to exit with the
    // returned code; an unhandled rejection here would surface as a stack trace
    // and an exit status nobody chose.
    await writeFile(join(root, 'blocked'), 'not a directory', 'utf8')

    const result = await runIngest(deps({ contentDir: join(root, 'blocked', 'content') }))

    expect(result.code).toBe(1)
    expect(result.wrote).toBe(false)
    expect(result.reasons.length).toBeGreaterThan(0)
  })

  // -------------------------------------------------------------------------
  // Dry run
  // -------------------------------------------------------------------------

  it('curates but writes nothing on a dry run', async () => {
    const generate = makeGenerator()
    const fetchImage = vi.fn(async () => PNG)

    const result = await runIngest(deps({ generate, fetchImage }), { dryRun: true })

    expect(result.code).toBe(0)
    expect(result.wrote).toBe(false)
    // A dry run is for seeing what today's edition *would* be, so the model does
    // run — that is the difference between it and the idempotence check above.
    expect(generate).toHaveBeenCalledTimes(1)
    expect(result.edition?.items).toHaveLength(TARGET_COUNT)

    // But nothing lands on disk, including images.
    expect(fetchImage).not.toHaveBeenCalled()
    await nothingWritten()
  })

  // -------------------------------------------------------------------------
  // The happy path
  // -------------------------------------------------------------------------

  it('writes a valid edition on the happy path', async () => {
    const fetchImage = vi.fn(async () => PNG)

    const result = await runIngest(deps({ fetchImage }))

    expect(result.code).toBe(0)
    expect(result.wrote).toBe(true)
    expect(result.reasons).toEqual([])
    expect(result.path).toBe(join(contentDir, `${DATE}.json`))
    expect(result.candidateCount).toBeGreaterThan(TARGET_COUNT)
    expect(result.failures).toEqual([])
    expect(result.unparseable).toBe(0)

    const written = await readEdition()

    expect(written.date).toBe(DATE)
    expect(written.generatedAt).toBe(NOW.toISOString())
    expect(written.targetCount).toBe(TARGET_COUNT)
    expect(written.summary.length).toBeGreaterThan(0)
    expect(written.items).toHaveLength(TARGET_COUNT)

    // Ranked, uniquely, in order.
    expect(written.items.map((item) => item.rank)).toEqual(
      Array.from({ length: TARGET_COUNT }, (_, index) => index + 1),
    )

    // The world band, counted from the source that actually published each item.
    const worldItems = written.items.filter((item) => item.source.name === 'World Desk')
    expect(worldItems).toHaveLength(WORLD_MIN)

    // Title, url and date come off the feed, never off the model.
    for (const item of written.items) {
      expect(item.url).toMatch(/^https:\/\//)
      expect(item.title).toMatch(/headline number \d+$/)
      expect(item.publishedAt).toBe(new Date(PUB_DATE).toISOString())
      expect(item.description.length).toBeGreaterThan(0)
    }

    // Images were re-encoded and written for the items whose feed carried one;
    // the world items had none, so they are null rather than missing.
    const files = await readdir(imageDir)
    expect(files.length).toBe(TARGET_COUNT - WORLD_MIN)
    expect(files.every((file) => file.endsWith('.webp'))).toBe(true)
    for (const item of written.items) {
      const expected = item.source.name === 'World Desk' ? null : `/img/${item.id}.webp`
      expect(item.image).toBe(expected)
    }
  })

  // -------------------------------------------------------------------------
  // Images are the expensive stage — they must not run over the whole pool
  // -------------------------------------------------------------------------

  it('resolves and downloads images only for the curated items', async () => {
    // Far more candidates than the edition can hold. Reading the article page and
    // downloading the picture for all of them would be a hundred needless remote
    // fetches per run, on URLs that came out of untrusted feeds.
    const fetcher = makeFetcher({ counts: { ai1: 40, ai2: 40, world1: 20 } })
    const fetchHtml = vi.fn(async (): Promise<string> => {
      throw new Error('no article page available')
    })
    const fetchImage = vi.fn(async () => PNG)

    const result = await runIngest(deps({ fetcher, fetchHtml, fetchImage }))

    expect(result.code).toBe(0)
    expect(result.wrote).toBe(true)
    expect(result.candidateCount).toBeGreaterThan(TARGET_COUNT * 3)

    expect(fetchImage.mock.calls.length).toBeLessThanOrEqual(TARGET_COUNT)
    expect(fetchHtml.mock.calls.length).toBeLessThanOrEqual(TARGET_COUNT)

    // Tighter than the ceiling: exactly the chosen items, split by whether their
    // feed already carried a picture.
    expect(fetchImage).toHaveBeenCalledTimes(TARGET_COUNT - WORLD_MIN)
    expect(fetchHtml).toHaveBeenCalledTimes(WORLD_MIN)
  })

  // -------------------------------------------------------------------------
  // The archive is honoured
  // -------------------------------------------------------------------------

  it('excludes items already published in an earlier edition', async () => {
    const earlier: Edition = {
      date: '2026-08-07',
      generatedAt: '2026-08-07T09:00:00.000Z',
      summary: 'Yesterday.',
      targetCount: TARGET_COUNT,
      items: [
        {
          id: 'aaaaaaaaaaaa',
          rank: 1,
          // Same story, republished today under the same headline.
          title: 'ai1 headline number 1',
          description: 'Ran yesterday.',
          url: 'https://ai1.example.com/1',
          image: null,
          source: { name: 'Outlet One', kind: 'press' },
          publishedAt: '2026-08-07T10:00:00.000Z',
          topics: ['models'],
        },
      ],
    }

    await writeFile(
      join(contentDir, '2026-08-07.json'),
      `${JSON.stringify(earlier, null, 2)}\n`,
      'utf8',
    )

    const result = await runIngest(deps())

    expect(result.code).toBe(0)
    expect(result.wrote).toBe(true)

    const written = await readEdition()
    expect(written.items.some((item) => item.title === 'ai1 headline number 1')).toBe(false)
  })
})
