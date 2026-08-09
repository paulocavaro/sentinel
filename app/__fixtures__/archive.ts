// A temporary archive on disk, for the tests that exercise a whole route.
//
// `/`, `/day/[date]` and `/archive` are async server components that take no
// props: their entire input is `content/days/`. `lib/edition.ts` resolves that
// directory per call rather than at import, from `process.cwd()`, which is what
// makes it movable — so these helpers put a fresh temp directory in front of it
// and write exactly the editions a test needs.
//
// Nothing here reads the committed archive, for the reason `lib/edition.test.ts`
// gives: it holds two editions today and both will change, so a test asserting
// anything about their contents fails one morning at 09:23 for a reason that has
// nothing to do with the code under test.
//
// **`React.cache` is not a hazard here.** Both readers are wrapped in it, and
// their cache key is the argument list — which is empty, because the directory
// arrives through a default parameter. Inside a render that is the point: one
// read per page. Outside one there is no cache dispatcher and `cache` calls
// straight through, so a second test sees its own directory rather than the
// first test's answer. Every test file below writes a different date, so a leak
// would not be subtle: the second test in a file would assert against the first
// one's edition.

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { vi } from 'vitest'

import type { Edition, EditionItem } from '@/lib/edition'
import { CONTENT_DIR } from '@/lib/ingest/config'
import type { Theme } from '@/lib/ingest/types'

/**
 * One item. The defaults are a complete, valid record — every field the card
 * renders — so a test names only the field it is about.
 */
export function item(over: Partial<EditionItem> = {}): EditionItem {
  return {
    id: '000000000001',
    rank: 1,
    title: 'Anthropic ships a model',
    description: 'Why this matters, in one plain sentence that runs on a while.',
    url: 'https://www.example.com/a',
    image: '/img/000000000001.webp',
    publisher: 'Example',
    feed: { name: 'Example', kind: 'press' },
    publishedAt: '2026-08-09T08:00:00.000Z',
    topics: ['models'],
    ...over,
  }
}

/**
 * An edition of `count` items, ranked from one.
 *
 * `themes` is cycled over the items, so `['ai', 'world']` on six items gives
 * three of each in alternation — enough to produce two sections and two chips
 * without a test having to build twenty item literals. Omit it for a themeless
 * edition, which is the shape of `2026-08-08.json` and the one case where the
 * chip row is absent entirely.
 *
 * `targetCount` defaults to `count`, i.e. a complete day. A test that wants
 * `isThin` passes a larger one — the field is the ceiling the edition was built
 * against, never today's constant.
 */
export function edition(
  date: string,
  count: number,
  { themes, targetCount }: { themes?: readonly Theme[]; targetCount?: number } = {},
): Edition {
  return {
    date,
    generatedAt: `${date}T09:23:00.000Z`,
    summary: 'A quiet day, with one model release worth reading about.',
    targetCount: targetCount ?? count,
    items: Array.from({ length: count }, (_, i) =>
      item({
        id: String(i + 1).padStart(12, '0'),
        rank: i + 1,
        title: `Story number ${i + 1}`,
        url: `https://www.example.com/${i + 1}`,
        image: `/img/${String(i + 1).padStart(12, '0')}.webp`,
        ...(themes === undefined ? {} : { theme: themes[i % themes.length] }),
      }),
    ),
  }
}

export type TempArchive = {
  /** Where it lives. Rarely needed — the routes find it through `process.cwd()`. */
  dir: string
  /** Write an edition into it. The file is named by `edition.date`, as the pipeline names it. */
  put: (value: Edition) => Promise<void>
  /**
   * Write a file for a date by hand.
   *
   * For the damaged editions, which `put` cannot express: the whole point of a
   * file the reader refuses is that it is not an `Edition`, and a merge conflict
   * or a field that changed shape does not arrive as a typed value. The reader's
   * unreadable state is only reachable through this.
   */
  putRaw: (date: string, contents: string) => Promise<void>
  /** Remove it, and give `process.cwd()` back. */
  drop: () => Promise<void>
}

/**
 * A fresh, empty archive, with `process.cwd()` pointed at it.
 *
 * Empty is a state in its own right: it is a fresh clone, and this repository
 * between its first commit and its first successful ingest. Both `/` and
 * `/archive` have a branch for it.
 */
export async function tempArchive(): Promise<TempArchive> {
  const dir = await mkdtemp(join(tmpdir(), 'sentinel-app-'))
  await mkdir(join(dir, CONTENT_DIR), { recursive: true })

  const cwd = vi.spyOn(process, 'cwd').mockReturnValue(dir)

  return {
    dir,
    put: async (value: Edition) => {
      await writeFile(join(dir, CONTENT_DIR, `${value.date}.json`), JSON.stringify(value))
    },
    putRaw: async (date: string, contents: string) => {
      await writeFile(join(dir, CONTENT_DIR, `${date}.json`), contents)
    },
    drop: async () => {
      cwd.mockRestore()
      await rm(dir, { recursive: true, force: true })
    },
  }
}
