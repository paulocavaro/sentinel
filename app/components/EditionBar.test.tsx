import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { EditionBar, neighbours } from './EditionBar'

// `neighbours` is the archive's navigation. It is the reason the bar links at
// editions that exist rather than at calendar days, and the pipeline is designed
// to miss days, so every gap case below is a shape the product actually reaches.
//
// The bar itself is rendered with `renderToStaticMarkup` — the pattern
// `lib/typeset.test.tsx` set — because these routes are prerendered to HTML at
// build time. What that HTML says is what the reader gets.

const html = renderToStaticMarkup

describe('neighbours', () => {
  it('finds the nearest edition either side', () => {
    const dates = ['2026-08-11', '2026-08-09', '2026-08-08']

    expect(neighbours('2026-08-09', dates)).toEqual({
      prev: '2026-08-08',
      next: '2026-08-11',
    })
  })

  it('answers null at the ends of the archive', () => {
    const dates = ['2026-08-09', '2026-08-08']

    expect(neighbours('2026-08-08', dates).prev).toBeNull()
    expect(neighbours('2026-08-09', dates).next).toBeNull()
  })

  // The nearest, not the adjacent: 9 and 10 August are missing from the archive
  // and the bar still has somewhere to send the reader in both directions.
  it('steps over gaps rather than into them', () => {
    expect(neighbours('2026-08-11', ['2026-08-11', '2026-08-08'])).toEqual({
      prev: '2026-08-08',
      next: null,
    })
  })

  // `/day/2026-08-10` is a real route — `generateStaticParams` produces every
  // day the archive spans — and it renders `NoEdition`, which needs both
  // neighbours to offer.
  it('works for a date that is not itself an edition', () => {
    expect(neighbours('2026-08-10', ['2026-08-11', '2026-08-08'])).toEqual({
      prev: '2026-08-08',
      next: '2026-08-11',
    })
  })

  // The comment on the function says it sorts rather than trusts, because a bar
  // that silently reversed when its caller changed order would be a very quiet
  // bug. This is that assertion.
  it('does not depend on the order it is given', () => {
    const shuffled = ['2026-08-08', '2026-08-11', '2026-08-09']

    expect(neighbours('2026-08-09', shuffled)).toEqual(
      neighbours('2026-08-09', [...shuffled].reverse()),
    )
  })

  it('does not offer the date itself in either direction', () => {
    expect(neighbours('2026-08-09', ['2026-08-09'])).toEqual({ prev: null, next: null })
  })

  it('has nothing to offer from an empty archive', () => {
    expect(neighbours('2026-08-09', [])).toEqual({ prev: null, next: null })
  })
})

describe('EditionBar', () => {
  const both = html(<EditionBar date="2026-08-09" dates={['2026-08-11', '2026-08-08']} home />)

  it('links at the neighbouring editions, and marks the direction', () => {
    expect(both).toContain('<a class="day" rel="prev" href="/day/2026-08-08">')
    expect(both).toContain('<a class="day" rel="next" href="/day/2026-08-11">')
  })

  // Two adjacent text nodes are separated by a `<!-- -->` marker in the streamed
  // HTML, which would put the arrow on the far side of it. One template string
  // is the fix, and this is what proves it stayed one.
  it('keeps each arrow in the same text node as its date', () => {
    expect(both).toContain('>← 8 August<')
    expect(both).toContain('>11 August →<')
  })

  // The prefix is the whole of what makes this slot different from the two
  // dates beside it once the styling is gone. `aria-current="date"` is valid
  // here and kept, but it earns no accessible object of its own on a span with
  // no role, so nothing may depend on it: in Chromium's tree the three slots
  // are one text run, and a run that opens with "Reading" is the one thing that
  // tells a reader which of the three dates they are on.
  it('names the day being read, in words, and does not link it', () => {
    expect(both).toContain(
      '<span class="day is-current" aria-current="date"><span class="sr-only">Reading </span>9 August</span>',
    )
  })

  it('offers the whole archive', () => {
    expect(both).toContain('<a class="day day-all" href="/archive">All editions</a>')
  })

  // The home route is already the latest edition, so the link would point at the
  // page the reader is on. Everywhere else it is the only way back — `/day/…`
  // otherwise reaches `/` through `/archive`, two clicks for the most common
  // destination on the site.
  describe('the way back to the latest edition', () => {
    it('is absent on the home route', () => {
      expect(both).not.toContain('href="/">')
    })

    it('is offered on an archive day, before the archive link', () => {
      const day = html(
        <EditionBar date="2026-08-09" dates={['2026-08-11', '2026-08-08']} home={false} />,
      )

      expect(day).toContain('<a class="day day-all" href="/">Latest edition</a>')
      expect(day.indexOf('href="/"')).toBeLessThan(day.indexOf('href="/archive"'))
    })
  })

  describe('with no edition in a direction', () => {
    const earliest = html(<EditionBar date="2026-08-08" dates={['2026-08-09', '2026-08-08']} home />)

    // Present, not offered: the slot still shows the calendar neighbour's date,
    // and it recedes by losing the arrow and the hairline. Never by opacity —
    // that composited --machine to 1.84:1, below AA.
    it('still shows the calendar neighbour, with no href and no arrow', () => {
      expect(earliest).toContain('7 August<span class="sr-only"> (no edition)</span>')
      expect(earliest).not.toContain('href="/day/2026-08-07"')
      expect(earliest).not.toContain('← 7 August')
    })

    // The state is a word, not an attribute. It was an `<a>` with no href
    // carrying `aria-disabled="true"`, which announced nothing at all: that
    // anchor has role `generic`, exactly as the span does, and `generic` does
    // not support `aria-disabled` — it is not a global ARIA attribute. Measured
    // in Chromium, where the bar came out as one link, one text run holding
    // both dates, and one more link.
    it('says there is no edition in words, not in an attribute', () => {
      expect(earliest).toContain('<span class="day is-off">')
      expect(earliest).not.toContain('aria-disabled')
    })
  })
})
