import { describe, expect, it } from 'vitest'
import { DESCRIPTION_MAX, MIN_ITEMS, TARGET_COUNT, THEME_BANDS } from './config'
import type { Curation } from './curate'
import { THEMES } from './types'
import type { RawItem, Theme } from './types'
import { validateCuration } from './validate'
import type { ValidateOptions } from './validate'

/**
 * The real limits, read from `config.ts` — not a second copy of them. These
 * numbers reach the prompt through `buildPrompt` and the gate through
 * `validateCuration`, and a test asserting against its own hard-coded pair
 * would stay green through exactly the divergence that matters.
 */
const OPTS: ValidateOptions = {
  targetCount: TARGET_COUNT,
  minItems: MIN_ITEMS,
  bands: THEME_BANDS,
  descriptionMax: DESCRIPTION_MAX,
}

const id = (n: number): string => String(n).padStart(12, '0')

/**
 * One candidate per unit of every band's minimum, so a default pool satisfies
 * every floor and a test that breaks one rule gets exactly one reason back.
 *
 * Every candidate's allowlist holds a single theme, which is what lets
 * `curation` below assign the only legal one without coordinating anything.
 */
const REQUIRED: Theme[] = THEMES.flatMap((theme) =>
  Array.from({ length: THEME_BANDS[theme].min }, () => theme),
)

/**
 * Every minimum first, then round-robin into whatever headroom the maxima
 * leave. So a pool of any size up to `sum(max)` satisfies every band on its
 * own, and a test that breaks one rule is reported once rather than drowned in
 * band violations it did not mean to cause.
 */
function themeSequence(count: number): Theme[] {
  const sequence: Theme[] = [...REQUIRED]
  const used = new Map<Theme, number>(THEMES.map((theme) => [theme, 0]))
  for (const theme of sequence) used.set(theme, (used.get(theme) ?? 0) + 1)

  let placed = true
  while (sequence.length < count && placed) {
    placed = false
    for (const theme of THEMES) {
      if (sequence.length >= count) break
      if ((used.get(theme) ?? 0) >= THEME_BANDS[theme].max) continue
      sequence.push(theme)
      used.set(theme, (used.get(theme) ?? 0) + 1)
      placed = true
    }
  }

  return sequence.slice(0, count)
}

function candidates(count: number, themes: readonly Theme[] = themeSequence(count)): RawItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: id(index + 1),
    title: `Story ${index + 1}`,
    summary: 'A sanitized feed summary.',
    url: `https://e.com/${index + 1}`,
    imageUrl: null,
    source: { id: 's', name: 'Source One', kind: 'press' as const, priority: 1 },
    themes: [themes[index] ?? 'ai'] as readonly Theme[],
    publishedAt: '2026-08-07T10:00:00.000Z',
  }))
}

/** How many candidates the default pool needs before every minimum is met. */
const ENOUGH = Math.max(MIN_ITEMS, REQUIRED.length)

/**
 * A well-formed curation choosing every candidate, ranked in order, each item
 * filed under the only theme its candidate allows.
 */
function curation(items: readonly RawItem[]): Curation {
  return {
    summary: 'A quiet day, with one model release worth reading about.',
    items: items.map((item, index) => ({
      id: item.id,
      rank: index + 1,
      description: 'Why this matters, in one plain sentence.',
      theme: item.themes[0],
      topics: ['models', 'policy'],
    })),
  }
}

describe('validateCuration', () => {
  it('returns an empty array for a well-formed curation', () => {
    const pool = candidates(ENOUGH)
    expect(validateCuration(curation(pool), pool, OPTS)).toEqual([])
  })

  // -------------------------------------------------------------------------
  // Which items appear
  // -------------------------------------------------------------------------

  it('rejects an id that is not in the candidates, because the model invented it', () => {
    const pool = candidates(ENOUGH)
    const bad = curation(pool)
    bad.items[9].id = 'ffffffffffff'

    const reasons = validateCuration(bad, pool, OPTS)
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toContain('ffffffffffff')
    expect(reasons[0]).toMatch(/candidate list/i)
  })

  it('rejects a duplicate id', () => {
    const pool = candidates(ENOUGH)
    const bad = curation(pool)
    bad.items[1].id = bad.items[0].id

    const reasons = validateCuration(bad, pool, OPTS)
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toContain(id(1))
    expect(reasons[0]).toMatch(/once/i)
  })

  it('rejects more items than the target', () => {
    const pool = candidates(TARGET_COUNT + 1)
    const reasons = validateCuration(curation(pool), pool, OPTS)
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toContain(`more than the target of ${TARGET_COUNT}`)
  })

  it('rejects fewer items than the floor', () => {
    const pool = candidates(MIN_ITEMS - 1)
    const reasons = validateCuration(curation(pool), pool, OPTS)
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toContain(`fewer than the minimum of ${MIN_ITEMS}`)
  })

  it('rejects a curation with no items at all', () => {
    const pool = candidates(ENOUGH)
    const bad: Curation = { ...curation(pool), items: [] }
    expect(validateCuration(bad, pool, OPTS).length).toBeGreaterThan(0)
  })

  it('rejects a duplicate rank', () => {
    const pool = candidates(ENOUGH)
    const bad = curation(pool)
    bad.items[1].rank = bad.items[0].rank

    const reasons = validateCuration(bad, pool, OPTS)
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toMatch(/rank 1/i)
  })

  // -------------------------------------------------------------------------
  // Model-authored text
  // -------------------------------------------------------------------------

  it('rejects a whitespace-only description', () => {
    const pool = candidates(ENOUGH)
    const bad = curation(pool)
    bad.items[3].description = '   '

    const reasons = validateCuration(bad, pool, OPTS)
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toContain(id(4))
    expect(reasons[0]).toMatch(/blank/i)
  })

  it('rejects a description over the length cap', () => {
    const pool = candidates(ENOUGH)
    const bad = curation(pool)
    bad.items[0].description = `${'word '.repeat(DESCRIPTION_MAX)}end`

    const reasons = validateCuration(bad, pool, OPTS)
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toContain(`over the limit of ${DESCRIPTION_MAX}`)
  })

  it('accepts a description exactly at the length cap', () => {
    const pool = candidates(ENOUGH)
    const edge = curation(pool)
    edge.items[0].description = 'a'.repeat(DESCRIPTION_MAX)
    expect(validateCuration(edge, pool, OPTS)).toEqual([])
  })

  it('rejects a description containing a URL', () => {
    const pool = candidates(ENOUGH)
    const bad = curation(pool)
    bad.items[2].description = 'The full write-up is at https://evil.example/pwn today.'

    const reasons = validateCuration(bad, pool, OPTS)
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toContain(id(3))
    expect(reasons[0]).toMatch(/link or markup/i)
  })

  it('rejects a description containing markup', () => {
    const pool = candidates(ENOUGH)
    const bad = curation(pool)
    bad.items[2].description = 'A release <script>alert(1)</script> worth reading.'

    const reasons = validateCuration(bad, pool, OPTS)
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toMatch(/link or markup/i)
  })

  it('rejects a description carrying a bare domain with a path', () => {
    const pool = candidates(ENOUGH)
    const bad = curation(pool)
    bad.items[2].description = 'Details at evil.example.com/pwn for anyone curious.'

    expect(validateCuration(bad, pool, OPTS)).toHaveLength(1)
  })

  it('rejects a description carrying entity-encoded markup', () => {
    const pool = candidates(ENOUGH)
    const bad = curation(pool)
    bad.items[2].description = 'A release &lt;img src=x onerror=1&gt; worth reading.'

    expect(validateCuration(bad, pool, OPTS)).toHaveLength(1)
  })

  it('passes ordinary editorial prose that merely names products', () => {
    const pool = candidates(ENOUGH)
    const fine = curation(pool)
    fine.items[0].description = 'Node.js/npm ship a fix; Character.AI and OpenAI both responded.'
    fine.items[1].description = 'Revenue rose 12.5% in Q3, the fastest growth since 2024.'

    expect(validateCuration(fine, pool, OPTS)).toEqual([])
  })

  it('rejects a summary containing a URL', () => {
    const pool = candidates(ENOUGH)
    const bad: Curation = { ...curation(pool), summary: 'See https://evil.example for more.' }

    const reasons = validateCuration(bad, pool, OPTS)
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toMatch(/summary/i)
  })

  it('rejects a summary containing markup', () => {
    const pool = candidates(ENOUGH)
    const bad: Curation = { ...curation(pool), summary: 'A quiet <b>day</b> in the field.' }

    const reasons = validateCuration(bad, pool, OPTS)
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toMatch(/summary/i)
  })

  it('rejects a blank summary', () => {
    const pool = candidates(ENOUGH)
    const bad: Curation = { ...curation(pool), summary: '  ' }

    const reasons = validateCuration(bad, pool, OPTS)
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toMatch(/summary/i)
  })

  it('rejects a topic containing markup', () => {
    const pool = candidates(ENOUGH)
    const bad = curation(pool)
    bad.items[5].topics = ['models', '<img src=x>']

    const reasons = validateCuration(bad, pool, OPTS)
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toContain(id(6))
    expect(reasons[0]).toMatch(/topic/i)
  })

  // -------------------------------------------------------------------------
  // Ranks are a sequence, not just a set of unique numbers
  // -------------------------------------------------------------------------

  it('rejects a gap in the ranks, not only a repeat', () => {
    // `1, 2, 3, 5, 7` has no duplicate and passed for a whole phase. Rank is the
    // edition's running order and `buildEdition` sorts on it, so a hole is
    // either an item dropped after ranking or a ranking never really made.
    const pool = candidates(ENOUGH)
    const bad = curation(pool)
    bad.items[4].rank = ENOUGH + 5

    const reasons = validateCuration(bad, pool, OPTS)
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toMatch(/no gaps/i)
    expect(reasons[0]).toContain('5')
  })

  it('names every missing rank, so the gap can be seen without re-deriving it', () => {
    const pool = candidates(ENOUGH)
    const bad = curation(pool)
    bad.items[3].rank = ENOUGH + 1
    bad.items[5].rank = ENOUGH + 2

    const reasons = validateCuration(bad, pool, OPTS)
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toContain('4, 6')
  })

  it('accepts ranks that are a permutation of 1..N, in any order', () => {
    const pool = candidates(ENOUGH)
    const shuffled = curation(pool)
    shuffled.items = [...shuffled.items].reverse().map((chosen, index) => ({
      ...chosen,
      rank: index + 1,
    }))

    expect(validateCuration(shuffled, pool, OPTS)).toEqual([])
  })

  it('reports a duplicate rank once, not twice as a duplicate and a gap', () => {
    // A repeat necessarily leaves a hole. Saying both would state one defect
    // twice to somebody reading the failure with no context.
    const pool = candidates(ENOUGH)
    const bad = curation(pool)
    bad.items[1].rank = bad.items[0].rank

    expect(validateCuration(bad, pool, OPTS)).toHaveLength(1)
  })

  // -------------------------------------------------------------------------
  // Themes
  // -------------------------------------------------------------------------

  it('rejects a theme that is not one of the five', () => {
    const pool = candidates(ENOUGH)
    const bad = curation(pool)
    bad.items[0].theme = 'AI'

    const reasons = validateCuration(bad, pool, OPTS)
    // The item stops counting toward its band, so the ai floor is short too.
    expect(reasons.some((reason) => reason.includes('"AI"'))).toBe(true)
    expect(reasons[0]).toContain(id(1))
  })

  it('rejects a theme the item’s own source does not allow', () => {
    // The theme is the only published field the model decides for itself, so it
    // is bounded by the source registry: Eurogamer cannot supply a science item.
    const pool = candidates(ENOUGH)
    const bad = curation(pool)
    bad.items[0].theme = 'culture'

    const reasons = validateCuration(bad, pool, OPTS)
    expect(reasons.some((reason) => /does not allow/i.test(reason))).toBe(true)
  })

  it('accepts either theme when the source allows both', () => {
    const pool = candidates(ENOUGH)
    const wide = pool.map((item, index) =>
      index === 0 ? { ...item, themes: ['ai', 'world'] as readonly Theme[] } : item,
    )
    const chosen = curation(pool)
    chosen.items[0].theme = 'world'

    // ai loses one and world gains one; both stay inside their bands.
    expect(validateCuration(chosen, wide, OPTS)).toEqual([])
  })

  // -------------------------------------------------------------------------
  // The theme bands
  // -------------------------------------------------------------------------

  it('rejects more items of a theme than its maximum', () => {
    const overfull = THEME_BANDS.culture.max + 1
    const pool = candidates(ENOUGH, [
      ...Array.from({ length: overfull }, () => 'culture' as Theme),
      ...themeSequence(ENOUGH - overfull),
    ])

    const reasons = validateCuration(curation(pool), pool, OPTS)
    expect(reasons.some((reason) => reason.includes('culture'))).toBe(true)
    expect(
      reasons.some((reason) => reason.includes(`more than the maximum of ${THEME_BANDS.culture.max}`)),
    ).toBe(true)
  })

  it('rejects fewer items of a theme than the pool could have supplied', () => {
    const pool = candidates(ENOUGH)
    const bad = curation(pool)
    // The candidates are still world candidates; the model just declines to use
    // them, keeping one where the band asks for `THEME_BANDS.world.min`.
    let kept = 0
    bad.items = bad.items
      .filter((chosen) => chosen.theme !== 'world' || kept++ < 1)
      .map((chosen, index) => ({ ...chosen, rank: index + 1 }))

    const reasons = validateCuration(bad, pool, OPTS)
    expect(reasons.some((reason) => /world item/.test(reason))).toBe(true)
    expect(reasons.some((reason) => /fewer than/.test(reason))).toBe(true)
  })

  it('softens a minimum to what the candidates can supply, so a thin theme is not a failure', () => {
    // A day with no games news at all. The band asks for two; the pool has none;
    // an edition without games is the correct outcome, not an aborted run.
    const withoutGames = themeSequence(ENOUGH).map((theme) =>
      theme === 'games' ? ('ai' as Theme) : theme,
    )
    const pool = candidates(ENOUGH, withoutGames)

    expect(validateCuration(curation(pool), pool, OPTS)).toEqual([])
  })

  it('counts supply from the candidates, never from anything the model claimed', () => {
    // Same curation, same ids, same everything the model produced — only the
    // themes the candidates allow differ. The verdict must follow the
    // candidates, because the model does not get to assert its own compliance.
    const pool = candidates(ENOUGH)
    const chosen = curation(pool)

    // A second pool where every candidate allows only ai, so every non-ai theme
    // the model claimed is outside its source's allowlist.
    const narrowed = pool.map((item) => ({ ...item, themes: ['ai'] as readonly Theme[] }))

    expect(validateCuration(chosen, pool, OPTS)).toEqual([])
    expect(validateCuration(chosen, narrowed, OPTS).length).toBeGreaterThan(0)
  })

  // -------------------------------------------------------------------------
  // Reporting
  // -------------------------------------------------------------------------

  it('reports every problem, not just the first', () => {
    const pool = candidates(ENOUGH)
    const bad = curation(pool)
    bad.items[0].id = 'ffffffffffff'
    bad.items[1].description = ' '

    const reasons = validateCuration(bad, pool, OPTS)
    expect(reasons.length).toBeGreaterThan(1)
    expect(reasons.some((r) => r.includes('ffffffffffff'))).toBe(true)
    expect(reasons.some((r) => /blank/i.test(r))).toBe(true)
  })

  it('reads as whole sentences, because a person reads these with no context', () => {
    const pool = candidates(4)
    const bad = curation(pool)
    bad.items[0].id = 'ffffffffffff'
    bad.items[1].rank = bad.items[2].rank
    bad.items[3].description = 'Go to https://evil.example now'

    const reasons = validateCuration(bad, pool, OPTS)
    expect(reasons.length).toBeGreaterThan(3)
    for (const reason of reasons) {
      expect(reason).toMatch(/^[A-Z].*\.$/)
      expect(reason.length).toBeGreaterThan(20)
    }
  })
})
