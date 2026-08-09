import { describe, expect, it } from 'vitest'
import { MIN_ITEMS, TARGET_COUNT, THEME_BANDS } from './config'
import { THEMES } from './types'

/**
 * The bands are the one piece of configuration that can make every future run
 * impossible without saying so.
 *
 * If the minima summed above `TARGET_COUNT` the model would be asked for more
 * items than an edition may hold, and validation would reject every curation it
 * produced — every morning, with a reason that names a theme count and never
 * mentions this file. If the maxima summed below `TARGET_COUNT` a full edition
 * would be unreachable by construction. Both are arithmetic, so both are caught
 * here rather than at 09:00.
 */
describe('THEME_BANDS', () => {
  const sum = (pick: (band: { min: number; max: number }) => number): number =>
    THEMES.reduce((total, theme) => total + pick(THEME_BANDS[theme]), 0)

  it('covers every theme, and only the themes', () => {
    expect(Object.keys(THEME_BANDS).sort()).toEqual([...THEMES].sort())
  })

  it('holds sum(min) <= MIN_ITEMS <= TARGET_COUNT <= sum(max)', () => {
    const minimum = sum((band) => band.min)
    const maximum = sum((band) => band.max)

    expect(minimum).toBeLessThanOrEqual(MIN_ITEMS)
    expect(MIN_ITEMS).toBeLessThanOrEqual(TARGET_COUNT)
    expect(TARGET_COUNT).toBeLessThanOrEqual(maximum)
  })

  it('gives every theme a band that is satisfiable on its own', () => {
    for (const theme of THEMES) {
      const band = THEME_BANDS[theme]
      expect(band.min).toBeGreaterThanOrEqual(0)
      expect(band.max).toBeGreaterThanOrEqual(band.min)
      expect(band.max).toBeLessThanOrEqual(TARGET_COUNT)
    }
  })
})
