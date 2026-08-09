import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ThemeCount } from './ThemeFilter'

// The chip row, and the clamp between the URL and the page.
//
// The state is the URL: nothing is copied into `useState`, so what the row
// renders is a pure function of the query string and the edition's own themes.
// That is what makes this testable without a browser — the hook is the only
// input the row does not receive as a prop, and mocking it is mocking the
// address bar.
//
// **The clamp is the part that matters.** `?theme=sports`, `?theme=`, a
// repeated `?theme=ai&theme=world`, and a theme that is real but absent from
// this edition all have to resolve to "no filter". Unclamped, the URL is the
// door that the derived chip row — which never prints a chip for a theme with
// no items — was locked to prevent: a masthead, an empty page, and a closing
// mark still counting thirty.

const url = { params: new URLSearchParams() }

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useSearchParams: () => url.params,
}))

const { ThemeFilter } = await import('./ThemeFilter')

const THEMES: ThemeCount[] = [
  { theme: 'ai', count: 4 },
  { theme: 'world', count: 1 },
]

/** The row as the reader receives it, for a given query string. */
function rowFor(query: string, themes: ThemeCount[] = THEMES): string {
  url.params = new URLSearchParams(query)
  return renderToStaticMarkup(<ThemeFilter themes={themes} />)
}

beforeEach(() => {
  url.params = new URLSearchParams()
})

describe('ThemeFilter', () => {
  describe('with no themes', () => {
    // The edition of 8 August predates the field entirely. A control that
    // filters to nothing is worse than an absent one — the reference makes the
    // same decision — and it also means `?theme=` anything on that page reaches
    // no code at all.
    it('renders nothing', () => {
      expect(rowFor('?theme=ai', [])).toBe('')
    })
  })

  describe('the row', () => {
    const unfiltered = rowFor('')

    it('prints one chip per theme, labelled', () => {
      expect(unfiltered).toContain('>Artificial intelligence<')
      expect(unfiltered).toContain('>The world<')
    })

    it('links each chip at its own theme and section', () => {
      expect(unfiltered).toContain('href="?theme=ai#ai"')
      expect(unfiltered).toContain('href="?theme=world#world"')
    })

    // Passing `false` would render the string "false", which is ARIA's value
    // for *not* current. Passing nothing is the version that needs no guard.
    //
    // The unfiltered page used to have no current chip at all, which left a
    // screen reader with nothing to anchor on and left a sighted reader with no
    // way to see that "no filter" is itself a state. `Everything` is that state.
    it('marks Everything current when nothing is filtered, and only Everything', () => {
      expect(unfiltered).toContain('<a class="chip" aria-current="true" href="?#results">Everything</a>')
      expect((unfiltered.match(/aria-current/g) ?? []).length).toBe(1)
    })

    it('always has exactly one current chip, whatever the URL says', () => {
      for (const query of ['', '?theme=ai', '?theme=sports', '?theme=ai&theme=world']) {
        expect((rowFor(query).match(/aria-current/g) ?? []).length).toBe(1)
      }
    })
  })

  describe('when the URL names a theme the edition carries', () => {
    const filtered = rowFor('?theme=ai')

    it('marks that chip, and only that chip', () => {
      expect(filtered).toContain('<a class="chip" aria-current="true" href="?#ai">')
      expect(filtered).toContain('<a class="chip" href="?theme=world#world">')
    })

    // The selected chip's href drops the parameter and keeps the fragment, so
    // the one control the row has can be turned off by the same click that
    // turned it on.
    it('lets the selected chip clear itself', () => {
      expect(filtered).toContain('href="?#ai"')
    })

    it('says what is being shown, and counts it', () => {
      expect(filtered).toContain('Showing 4 items in Artificial intelligence.')
    })

    it('says "1 item" rather than "1 items"', () => {
      expect(rowFor('?theme=world')).toContain('Showing 1 item in The world.')
    })
  })

  // Every one of these is a URL a reader can produce by hand, and each one has
  // to land on the whole edition rather than on an empty page.
  describe('when the URL names something else', () => {
    it.each([
      ['a theme that does not exist', '?theme=sports'],
      ['an empty value', '?theme='],
      ['no parameter at all', ''],
      ['a theme this edition does not carry', '?theme=games'],
    ])('shows the whole edition for %s', (_, query) => {
      const row = rowFor(query)

      expect(row).toContain('aria-current="true" href="?#results">Everything')
      expect(row).toContain('Showing the whole edition.')
    })

    // `getAll` rather than `get`: `get` would answer 'ai' and filter to a page
    // the address bar does not describe. More than one value is an instruction
    // this control cannot carry out, so it carries out none of it.
    it('refuses a repeated parameter rather than picking one', () => {
      const row = rowFor('?theme=ai&theme=world')

      expect(row).toContain('aria-current="true" href="?#results">Everything')
      expect(row).toContain('Showing the whole edition.')
    })
  })

  // The list is replaced silently otherwise: the items change and a screen
  // reader is told nothing at all. The unfiltered sentence exists so that
  // clearing the filter announces something too.
  describe('the live region', () => {
    it('is polite, beside the chips, and never empty', () => {
      for (const query of ['', '?theme=ai', '?theme=sports']) {
        expect(rowFor(query)).toMatch(
          /<p class="sr-only" role="status" aria-live="polite">Showing [^<]+<\/p>/,
        )
      }
    })
  })
})
