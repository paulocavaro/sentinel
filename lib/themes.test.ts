import { describe, expect, it } from 'vitest'

import type { Edition, EditionItem } from './edition'
import { FEATURES_PER_SECTION, THEME_LABELS, leadOf, sectionsOf } from './themes'

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

function edition(items: EditionItem[]): Edition {
  return {
    date: '2026-08-09',
    generatedAt: '2026-08-09T09:23:00.000Z',
    summary: 'A day with one model release worth reading about.',
    targetCount: 30,
    items,
  }
}

/** `n` items, ranked from `from`, all in one theme. Ids are unique across a call. */
function run(n: number, over: Partial<EditionItem> = {}, from = 2): EditionItem[] {
  return Array.from({ length: n }, (_, at) =>
    item({ id: id(from + at), rank: from + at, url: `https://e.com/${from + at}`, ...over }),
  )
}

// ---------------------------------------------------------------------------
// THEME_LABELS
// ---------------------------------------------------------------------------

describe('THEME_LABELS', () => {
  /**
   * The reference's strings, character for character. `AI` or `World` would
   * render a page that passes every other check here and fails the visual gate
   * on the one thing a section heading is.
   */
  it('is the reference wording, not an abbreviation', () => {
    expect(THEME_LABELS).toEqual({
      ai: 'Artificial intelligence',
      world: 'The world',
      games: 'Games',
      science: 'Science',
      culture: 'Culture',
    })
  })
})

// ---------------------------------------------------------------------------
// leadOf
// ---------------------------------------------------------------------------

describe('leadOf', () => {
  it('is rank 1, wherever it sits in the array', () => {
    const lead = item({ id: id(9), rank: 1, url: 'https://e.com/9' })
    const found = leadOf(edition([item({ id: id(4), rank: 4 }), lead]))

    expect(found?.id).toBe(id(9))
  })

  it('falls back to the first item when no item is ranked 1', () => {
    const found = leadOf(edition([item({ id: id(3), rank: 3 }), item({ id: id(4), rank: 4 })]))

    expect(found?.id).toBe(id(3))
  })

  it('is null for an edition with no items', () => {
    expect(leadOf(edition([]))).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// sectionsOf
// ---------------------------------------------------------------------------

describe('sectionsOf', () => {
  it('groups in the canonical theme order, not the order of appearance', () => {
    const sections = sectionsOf(
      edition([
        item({ theme: 'culture' }),
        ...run(1, { theme: 'science' }, 2),
        ...run(1, { theme: 'ai' }, 3),
        ...run(1, { theme: 'culture' }, 4),
        ...run(1, { theme: 'games' }, 5),
        ...run(1, { theme: 'world' }, 6),
      ]),
    )

    expect(sections.map((section) => section.theme)).toEqual([
      'ai',
      'world',
      'games',
      'science',
      'culture',
    ])
  })

  it('produces no group for a theme with no items', () => {
    const sections = sectionsOf(
      edition([item({ theme: 'ai' }), ...run(2, { theme: 'games' })]),
    )

    expect(sections.map((section) => section.theme)).toEqual(['games'])
  })

  /**
   * A theme carried by the lead alone is a theme with no section. The lead is
   * already on the page above every section; opening a named section for it
   * would print the story twice under its own heading.
   */
  it('produces no group for a theme only the lead carries', () => {
    const sections = sectionsOf(
      edition([item({ rank: 1, theme: 'ai' }), ...run(3, { theme: 'world' })]),
    )

    expect(sections.map((section) => section.theme)).toEqual(['world'])
  })

  it('excludes the lead from its own section, so it is not rendered twice', () => {
    const sections = sectionsOf(
      edition([item({ id: id(1), rank: 1, theme: 'ai' }), ...run(5, { theme: 'ai' })]),
    )

    const ids = sections.flatMap((section) => [...section.features, ...section.briefs]).map((i) => i.id)

    expect(ids).not.toContain(id(1))
    expect(ids).toHaveLength(5)
  })

  /**
   * `content/days/2026-08-08.json` predates the theme field. Twenty items with
   * no theme at all are one unlabelled group — not five empty sections, and not
   * twenty items dropped off the page.
   */
  it('renders an edition whose items carry no theme as one unlabelled group', () => {
    const sections = sectionsOf(edition([item({ rank: 1 }), ...run(19)]))

    expect(sections).toHaveLength(1)
    expect(sections[0]?.theme).toBeNull()
    expect(sections[0]?.label).toBeNull()
    expect(sections[0]?.features).toHaveLength(FEATURES_PER_SECTION)
    expect(sections[0]?.briefs).toHaveLength(15)
  })

  it('gives an edition with no items no groups at all', () => {
    expect(sectionsOf(edition([]))).toEqual([])
  })

  /**
   * An item whose theme was unreadable keeps its place on the page. The reader
   * drops an unrecognised theme to absent rather than failing the item, and the
   * closing mark counts `items.length` — so an item quietly left out of every
   * section would print a page that contradicts its own count.
   */
  it('collects themeless items into a trailing unlabelled group', () => {
    const sections = sectionsOf(
      edition([item({ rank: 1, theme: 'ai' }), ...run(2, { theme: 'games' }), ...run(1, {}, 4)]),
    )

    expect(sections.map((section) => section.theme)).toEqual(['games', null])
    expect(sections[1]?.features.map((i) => i.rank)).toEqual([4])
  })

  it('splits each group into four features and the rest as briefs', () => {
    const [section] = sectionsOf(edition([item({ rank: 1, theme: 'world' }), ...run(6, { theme: 'ai' })]))

    expect(section?.theme).toBe('ai')
    expect(section?.label).toBe('Artificial intelligence')
    expect(section?.features.map((i) => i.rank)).toEqual([2, 3, 4, 5])
    expect(section?.briefs.map((i) => i.rank)).toEqual([6, 7])
  })

  it('leaves a short group with no briefs rather than an empty run', () => {
    const [section] = sectionsOf(edition([item({ rank: 1, theme: 'world' }), ...run(3, { theme: 'ai' })]))

    expect(section?.features).toHaveLength(3)
    expect(section?.briefs).toEqual([])
  })

  it('keeps the published order inside a group', () => {
    const [section] = sectionsOf(
      edition([
        item({ rank: 1, theme: 'world' }),
        item({ id: id(7), rank: 7, theme: 'ai' }),
        item({ id: id(2), rank: 2, theme: 'ai' }),
      ]),
    )

    expect(section?.features.map((i) => i.id)).toEqual([id(7), id(2)])
  })
})
