import { describe, expect, it } from 'vitest'
import type { Curation } from './curate'
import type { RawItem } from './types'
import { validateCuration } from './validate'
import type { ValidateOptions } from './validate'

const OPTS: ValidateOptions = {
  targetCount: 20,
  minItems: 8,
  worldMin: 3,
  worldMax: 6,
  descriptionMax: 200,
}

const id = (n: number): string => String(n).padStart(12, '0')

/** `count` candidates, the first `worldCount` of them in the world lane. */
function candidates(count: number, worldCount = 4): RawItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: id(index + 1),
    title: `Story ${index + 1}`,
    summary: 'A sanitized feed summary.',
    url: `https://e.com/${index + 1}`,
    imageUrl: null,
    source: { id: 's', name: 'Source One', kind: 'press' as const, priority: 1 },
    lane: index < worldCount ? ('world' as const) : ('ai' as const),
    publishedAt: '2026-08-07T10:00:00.000Z',
  }))
}

/** A well-formed curation choosing every candidate, ranked in order. */
function curation(items: readonly RawItem[]): Curation {
  return {
    summary: 'A quiet day, with one model release worth reading about.',
    items: items.map((item, index) => ({
      id: item.id,
      rank: index + 1,
      description: 'Why this matters, in one plain sentence.',
      topics: ['models', 'policy'],
    })),
  }
}

describe('validateCuration', () => {
  it('returns an empty array for a well-formed curation', () => {
    const pool = candidates(10)
    expect(validateCuration(curation(pool), pool, OPTS)).toEqual([])
  })

  // -------------------------------------------------------------------------
  // Which items appear
  // -------------------------------------------------------------------------

  it('rejects an id that is not in the candidates, because the model invented it', () => {
    const pool = candidates(10)
    const bad = curation(pool)
    bad.items[9].id = 'ffffffffffff'

    const reasons = validateCuration(bad, pool, OPTS)
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toContain('ffffffffffff')
    expect(reasons[0]).toMatch(/candidate list/i)
  })

  it('rejects a duplicate id', () => {
    const pool = candidates(10)
    const bad = curation(pool)
    bad.items[1].id = bad.items[0].id

    const reasons = validateCuration(bad, pool, OPTS)
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toContain(id(1))
    expect(reasons[0]).toMatch(/once/i)
  })

  it('rejects more items than the target', () => {
    const pool = candidates(21)
    const reasons = validateCuration(curation(pool), pool, OPTS)
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toMatch(/more than the target of 20/i)
  })

  it('rejects fewer items than the floor', () => {
    const pool = candidates(5)
    const reasons = validateCuration(curation(pool), pool, OPTS)
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toMatch(/fewer than the minimum of 8/i)
  })

  it('rejects a curation with no items at all', () => {
    const pool = candidates(10)
    const bad: Curation = { ...curation(pool), items: [] }
    expect(validateCuration(bad, pool, OPTS).length).toBeGreaterThan(0)
  })

  it('rejects a duplicate rank', () => {
    const pool = candidates(10)
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
    const pool = candidates(10)
    const bad = curation(pool)
    bad.items[3].description = '   '

    const reasons = validateCuration(bad, pool, OPTS)
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toContain(id(4))
    expect(reasons[0]).toMatch(/blank/i)
  })

  it('rejects a description over the length cap', () => {
    const pool = candidates(10)
    const bad = curation(pool)
    bad.items[0].description = `${'word '.repeat(40)}end`

    const reasons = validateCuration(bad, pool, OPTS)
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toMatch(/over the limit of 200/i)
  })

  it('accepts a description exactly at the length cap', () => {
    const pool = candidates(10)
    const edge = curation(pool)
    edge.items[0].description = 'a'.repeat(200)
    expect(validateCuration(edge, pool, OPTS)).toEqual([])
  })

  it('rejects a description containing a URL', () => {
    const pool = candidates(10)
    const bad = curation(pool)
    bad.items[2].description = 'The full write-up is at https://evil.example/pwn today.'

    const reasons = validateCuration(bad, pool, OPTS)
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toContain(id(3))
    expect(reasons[0]).toMatch(/link or markup/i)
  })

  it('rejects a description containing markup', () => {
    const pool = candidates(10)
    const bad = curation(pool)
    bad.items[2].description = 'A release <script>alert(1)</script> worth reading.'

    const reasons = validateCuration(bad, pool, OPTS)
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toMatch(/link or markup/i)
  })

  it('rejects a description carrying a bare domain with a path', () => {
    const pool = candidates(10)
    const bad = curation(pool)
    bad.items[2].description = 'Details at evil.example.com/pwn for anyone curious.'

    expect(validateCuration(bad, pool, OPTS)).toHaveLength(1)
  })

  it('rejects a description carrying entity-encoded markup', () => {
    const pool = candidates(10)
    const bad = curation(pool)
    bad.items[2].description = 'A release &lt;img src=x onerror=1&gt; worth reading.'

    expect(validateCuration(bad, pool, OPTS)).toHaveLength(1)
  })

  it('passes ordinary editorial prose that merely names products', () => {
    const pool = candidates(10)
    const fine = curation(pool)
    fine.items[0].description = 'Node.js/npm ship a fix; Character.AI and OpenAI both responded.'
    fine.items[1].description = 'Revenue rose 12.5% in Q3, the fastest growth since 2024.'

    expect(validateCuration(fine, pool, OPTS)).toEqual([])
  })

  it('rejects a summary containing a URL', () => {
    const pool = candidates(10)
    const bad: Curation = { ...curation(pool), summary: 'See https://evil.example for more.' }

    const reasons = validateCuration(bad, pool, OPTS)
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toMatch(/summary/i)
  })

  it('rejects a summary containing markup', () => {
    const pool = candidates(10)
    const bad: Curation = { ...curation(pool), summary: 'A quiet <b>day</b> in the field.' }

    const reasons = validateCuration(bad, pool, OPTS)
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toMatch(/summary/i)
  })

  it('rejects a blank summary', () => {
    const pool = candidates(10)
    const bad: Curation = { ...curation(pool), summary: '  ' }

    const reasons = validateCuration(bad, pool, OPTS)
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toMatch(/summary/i)
  })

  it('rejects a topic containing markup', () => {
    const pool = candidates(10)
    const bad = curation(pool)
    bad.items[5].topics = ['models', '<img src=x>']

    const reasons = validateCuration(bad, pool, OPTS)
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toContain(id(6))
    expect(reasons[0]).toMatch(/topic/i)
  })

  // -------------------------------------------------------------------------
  // The world band
  // -------------------------------------------------------------------------

  it('rejects too few world items', () => {
    const pool = candidates(10, 1)
    const reasons = validateCuration(curation(pool), pool, OPTS)
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toMatch(/world/i)
    expect(reasons[0]).toMatch(/fewer than the minimum of 3/i)
  })

  it('rejects too many world items', () => {
    const pool = candidates(10, 7)
    const reasons = validateCuration(curation(pool), pool, OPTS)
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toMatch(/world/i)
    expect(reasons[0]).toMatch(/more than the maximum of 6/i)
  })

  it('counts world items from the candidates, never from anything the model claimed', () => {
    // Same curation, same ids, same everything the model produced — only the
    // lanes recorded on the candidates differ. The verdict must follow the
    // candidates, because the model does not get to assert its own compliance.
    const enough = candidates(10, 4)
    const notEnough = candidates(10, 0)
    const chosen = curation(enough)

    expect(validateCuration(chosen, enough, OPTS)).toEqual([])
    expect(validateCuration(chosen, notEnough, OPTS)).toHaveLength(1)
  })

  // -------------------------------------------------------------------------
  // Reporting
  // -------------------------------------------------------------------------

  it('reports every problem, not just the first', () => {
    const pool = candidates(10)
    const bad = curation(pool)
    bad.items[0].id = 'ffffffffffff'
    bad.items[1].description = ' '

    const reasons = validateCuration(bad, pool, OPTS)
    expect(reasons.length).toBeGreaterThan(1)
    expect(reasons.some((r) => r.includes('ffffffffffff'))).toBe(true)
    expect(reasons.some((r) => /blank/i.test(r))).toBe(true)
  })

  it('reads as whole sentences, because a person reads these with no context', () => {
    const pool = candidates(4, 0)
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
