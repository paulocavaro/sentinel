import { describe, expect, it } from 'vitest'

import { capitalise, inWords } from './words'

describe('inWords', () => {
  it('spells the count design-refs/states.html state 02 spells', () => {
    // "Seventeen items — the window was thin."
    expect(capitalise(inWords(17))).toBe('Seventeen')
  })

  it('covers the whole range an edition can carry, up to the target', () => {
    expect(inWords(1)).toBe('one')
    expect(inWords(20)).toBe('twenty')
    expect(inWords(29)).toBe('twenty-nine')
    expect(inWords(30)).toBe('thirty')
  })

  it('falls back to digits rather than throwing', () => {
    // Unreachable from an edition — items never exceed targetCount — but a
    // sentence is not worth a build failure.
    expect(inWords(31)).toBe('31')
    expect(inWords(1.5)).toBe('1.5')
    expect(inWords(-1)).toBe('-1')
  })
})
