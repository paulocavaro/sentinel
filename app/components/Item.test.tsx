import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { item } from '@/app/__fixtures__/archive'

import { Item } from './Item'

// The card, in its three tiers.
//
// The tiers are not three variants of one shape — a brief has no plate, an
// inline headline, an em dash and a `span.run` where the others have a `p.dek`
// — and that difference is load-bearing: it is why the theme filter cannot
// re-tier on the client, and why the compact tier survives at all. The visual
// gate compares the whole page against `design-refs/home.html`, so it catches a
// tier that renders wrong on the two dates the screens map pins. These check the
// tiers directly, on input the committed editions do not contain.

const html = renderToStaticMarkup

describe('Item', () => {
  describe('the lead', () => {
    const lead = html(<Item item={item()} tier="lead" />)

    it('is an h2, and the only one', () => {
      expect(lead).toContain('<h2 class="head" dir="auto">')
    })

    it('carries a plate at lead size and a dek with a lead-in', () => {
      expect(lead).toContain('class="plate plate-lead"')
      expect(lead).toContain('<p class="dek" dir="auto"><b class="entry">Why this</b>')
    })
  })

  describe('a feature', () => {
    const feature = html(<Item item={item()} tier="feature" />)

    it('is an h3 with a feature-sized plate', () => {
      expect(feature).toContain('<h3 class="head" dir="auto">')
      expect(feature).toContain('class="plate plate-feature"')
    })
  })

  describe('a brief', () => {
    const brief = html(<Item item={item()} tier="brief" />)

    it('has no plate at all', () => {
      expect(brief).not.toContain('plate')
    })

    // The summary runs on after an em dash rather than opening a block of its
    // own. That is how thirty attributed items fit on a screen without a card.
    it('runs on after a dash instead of opening a dek', () => {
      expect(brief).toContain('<span class="dash" aria-hidden="true"> — </span>')
      expect(brief).toContain('<span class="run" dir="auto">')
      expect(brief).not.toContain('class="dek"')
    })

    // The generator bolds the first two words of a `dek` and never of a `run`:
    // at this size the entry would be most of the line.
    it('has no lead-in bold', () => {
      expect(brief).not.toContain('class="entry"')
    })
  })

  describe('the headline link', () => {
    const rendered = html(<Item item={item({ url: 'https://www.reuters.com/x' })} tier="brief" />)

    it('opens in a new tab, safely', () => {
      expect(rendered).toContain('target="_blank" rel="noopener noreferrer"')
    })

    // The link opens somewhere else, so the destination is part of the
    // accessible name. The description deliberately is not, which is why the run
    // sits outside the anchor even though the click target covers it.
    it('says where it goes, without the www', () => {
      expect(rendered).toContain('<span class="sr-only"> (opens at reuters.com)</span>')
    })

    // This runs at build time. A single malformed record in one committed
    // edition must cost one destination label, not the whole site.
    it('does not throw on a URL that will not parse', () => {
      const broken = () => html(<Item item={item({ url: 'not a url' })} tier="brief" />)

      expect(broken).not.toThrow()
      expect(broken()).toContain('(opens at not a url)')
    })
  })

  // Titles and descriptions are attacker-writable: a Hacker News submission is
  // literally user-supplied text, and it reaches this component unchanged.
  // Nothing on this page may use dangerouslySetInnerHTML — `lib/typeset.tsx`
  // exists so the transforms return nodes instead of HTML strings — and this is
  // the assertion that says so out loud.
  describe('untrusted text', () => {
    const hostile = html(
      <Item
        item={item({
          title: 'A <script>alert(1)</script> headline',
          description: 'Ends with <img src=x onerror=alert(1)> in it, somewhere.',
        })}
        tier="brief"
      />,
    )

    it('escapes markup in the title', () => {
      expect(hostile).toContain('&lt;script&gt;')
      expect(hostile).not.toContain('<script>')
    })

    it('escapes markup in the description', () => {
      expect(hostile).toContain('&lt;img src=x onerror=alert(1)&gt;')
      expect(hostile).not.toContain('<img src=x')
    })
  })

  // The small-caps transform is `lib/typeset.tsx`'s and tested there. What is
  // checked here is that the card actually runs it, in every tier.
  describe('acronyms', () => {
    it('are wrapped wherever a title is set', () => {
      for (const tier of ['lead', 'feature', 'brief'] as const) {
        expect(html(<Item item={item({ title: 'The EU rules on AI' })} tier={tier} />)).toContain(
          '<span class="acr">EU</span>',
        )
      }
    })
  })

  // About a third of every day's items arrive without a photograph, so this is
  // an ordinary day rather than an exception. No element at all — not an empty
  // span — because `.item:not(:has(.plate)) .head` is what gives the headline
  // the space the picture would have had, and `:has(.plate)` matches an empty
  // `<span class="plate">` exactly as happily as a full one.
  describe('without a photograph', () => {
    it('leaves no plate element behind, in either plated tier', () => {
      for (const tier of ['lead', 'feature'] as const) {
        const bare = html(<Item item={item({ image: null })} tier={tier} />)

        expect(bare).not.toContain('plate')
        expect(bare).not.toContain('<img')
        expect(bare).toContain('class="head"')
      }
    })
  })

  // The page is lang="en" and there is no other `dir` in the document, so a
  // headline that opens with an Arabic or Hebrew name resolves against the
  // page's direction: the neutral run between that name and the English after
  // it reorders, and the publisher at the end of the line can come out at the
  // wrong end. Every element that carries a stranger's words takes its
  // direction from its own first strong character instead.
  describe('right-to-left text', () => {
    it('lets each of the three carry its own direction', () => {
      const brief = html(<Item item={item()} tier="brief" />)
      const feature = html(<Item item={item()} tier="feature" />)

      expect(brief).toContain('<h3 class="head" dir="auto">')
      expect(brief).toContain('<span class="run" dir="auto">')
      expect(feature).toContain('<p class="dek" dir="auto">')
    })

    // The byline is deliberately not in that list, and neither is anything in
    // the masthead: the publisher is `lib/ingest/publisher.ts`'s, not the
    // feed's, and the rest of the page is this product's own words.
    it('leaves the byline alone', () => {
      expect(html(<Item item={item()} tier="brief" />)).toContain('<p class="byline">')
    })
  })
})
