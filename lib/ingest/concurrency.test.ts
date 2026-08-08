import { describe, expect, it } from 'vitest'
import { mapWithConcurrency } from './concurrency'

describe('mapWithConcurrency', () => {
  it('never exceeds the limit', async () => {
    let active = 0, peak = 0
    await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8], 3, async () => {
      active++; peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 5))
      active--
    })
    expect(peak).toBeLessThanOrEqual(3)
  })

  it('returns one settled result per input, in order', async () => {
    const out = await mapWithConcurrency([1, 2, 3], 2, async (n) => n * 2)
    expect(out.map((r) => (r.status === 'fulfilled' ? r.value : null))).toEqual([2, 4, 6])
  })

  it('isolates a rejection instead of failing the batch', async () => {
    const out = await mapWithConcurrency([1, 2], 2, async (n) => {
      if (n === 1) throw new Error('boom')
      return n
    })
    expect(out[0].status).toBe('rejected')
    expect(out[1].status).toBe('fulfilled')
  })
})
