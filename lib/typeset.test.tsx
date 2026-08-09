import { isValidElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { Byline, leadIn, smallCaps } from './typeset'

// These two transforms run over model-authored and publisher-authored text. In
// design-refs/build-home.mjs they build HTML strings, because that script writes
// a file; here they must return React nodes, so that the one obvious way to use
// them cannot put untrusted text through dangerouslySetInnerHTML.
//
// The gate compares the app's rendering against that generator's, so the tests
// below also check the two agree character for character.

// Copied verbatim from design-refs/build-home.mjs (the `esc`, `smallCaps` and
// `leadIn` consts) so the parity assertions are against the reference's actual
// behaviour rather than against expectations typed out by hand.
const refEsc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const refSmallCaps = (s: string) => s.replace(/\b([A-Z]{2,4})\b/g, '<span class="acr">$1</span>')
const refLeadIn = (s: string) => {
  const m = s.match(/^(\S+\s+\S+)(\s+)([\s\S]*)$/)
  return m
    ? `<b class="entry">${refSmallCaps(refEsc(m[1]))}</b>${m[2]}${refSmallCaps(refEsc(m[3]))}`
    : refSmallCaps(refEsc(s))
}

const html = renderToStaticMarkup

describe('smallCaps', () => {
  it('wraps two-to-four-letter uppercase runs', () => {
    expect(html(<>{smallCaps('AI rules land in the US next week')}</>)).toBe(
      '<span class="acr">AI</span> rules land in the <span class="acr">US</span> next week',
    )
  })

  it('returns nodes, never an HTML string', () => {
    const out = smallCaps('AI and US')
    expect(typeof out).not.toBe('string')
    // A string return would be the shape that tempts a caller into
    // dangerouslySetInnerHTML; an array of nodes is not renderable that way.
    expect(Array.isArray(out)).toBe(true)
    for (const node of out as unknown[]) {
      expect(typeof node === 'string' || isValidElement(node)).toBe(true)
    }
  })

  it('leaves ordinary words alone', () => {
    expect(html(<>{smallCaps('The window was thin this morning')}</>)).toBe(
      'The window was thin this morning',
    )
  })

  it('returns the text unchanged when nothing matches', () => {
    expect(smallCaps('nothing to see here')).toBe('nothing to see here')
  })

  it('leaves a longer all-caps word alone, which is what keeps TECHCRUNCH full size', () => {
    expect(html(<>{smallCaps('TECHCRUNCH and OpenAI shipped')}</>)).toBe(
      'TECHCRUNCH and OpenAI shipped',
    )
  })

  it('does not treat the tail of a mixed-case word as an acronym', () => {
    expect(html(<>{smallCaps('OpenAI and DeepMind')}</>)).toBe('OpenAI and DeepMind')
  })

  it('escapes the text it wraps rather than emitting it as markup', () => {
    expect(html(<>{smallCaps('<script>alert(1)</script> from the US')}</>)).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt; from the <span class="acr">US</span>',
    )
  })

  it('escapes a double quote the same way the generator does', () => {
    // React escapes a quote in text content even though only an attribute
    // needs it, which happens to be exactly what the generator's esc() does —
    // so the two agree byte for byte and the parity checks below need no
    // normalisation.
    expect(html(<>{smallCaps('the "AI" bill')}</>)).toBe(
      'the &quot;<span class="acr">AI</span>&quot; bill',
    )
  })

  it('agrees with the reference generator', () => {
    for (const s of [
      'AI rules land in the US next week',
      'nothing to see here',
      'TECHCRUNCH and OpenAI shipped',
      'A UK–EU deal, and the ICC said so',
      'the "AI" bill & the <us> markup',
      'US&AI, either side of an escaped ampersand',
    ]) {
      expect(html(<>{smallCaps(s)}</>)).toBe(refSmallCaps(refEsc(s)))
    }
  })
})

describe('leadIn', () => {
  it('bolds the first two words and leaves the rest', () => {
    expect(html(<>{leadIn('The company said it would ship in March')}</>)).toBe(
      '<b class="entry">The company</b> said it would ship in March',
    )
  })

  it('applies small caps inside and outside the bold', () => {
    expect(html(<>{leadIn('US regulators told the AI labs to slow down')}</>)).toBe(
      '<b class="entry"><span class="acr">US</span> regulators</b> told the ' +
        '<span class="acr">AI</span> labs to slow down',
    )
  })

  it('falls back to small caps alone for a string with fewer than three words', () => {
    expect(html(<>{leadIn('AI wins')}</>)).toBe('<span class="acr">AI</span> wins')
    expect(html(<>{leadIn('Unremarkable')}</>)).toBe('Unremarkable')
  })

  it('returns nodes, never an HTML string', () => {
    expect(typeof leadIn('The company said it would ship')).not.toBe('string')
  })

  it('agrees with the reference generator', () => {
    for (const s of [
      'The company said it would ship in March',
      'US regulators told the AI labs to slow down',
      'AI wins',
      'Unremarkable',
      'A study of <b>bold</b> claims & "quotes" from the EU',
    ]) {
      expect(html(<>{leadIn(s)}</>)).toBe(refLeadIn(s))
    }
  })
})

describe('Byline', () => {
  // The regression this exists to prevent: a byline is already uppercased by
  // text-transform, so small caps on top renders CNN at x-height beside a
  // full-size TECHCRUNCH. Publishers go through this component, which does no
  // typesetting at all and says so.
  it('renders the publisher verbatim, with no small caps', () => {
    expect(html(<Byline>CNN</Byline>)).toBe('<p class="byline">CNN</p>')
    expect(html(<Byline>TechCrunch</Byline>)).toBe('<p class="byline">TechCrunch</p>')
  })

  it('escapes the publisher name', () => {
    expect(html(<Byline>{'A & B <news>'}</Byline>)).toBe(
      '<p class="byline">A &amp; B &lt;news&gt;</p>',
    )
  })
})
