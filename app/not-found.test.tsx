import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import NotFound from './not-found'

// A 404 is not one of the eight designed states: it is an address that was
// never part of the site, where `NoEdition` is a real date the pipeline missed.
// What the two share is their shape — a masthead saying what is true, and one
// link that goes somewhere real.

const html = renderToStaticMarkup

describe('NotFound', () => {
  const page = html(<NotFound />)

  it('says what is true in the place the date normally goes', () => {
    expect(page).toContain('<h1 class="editiondate">No such page</h1>')
    expect(page).toContain('This address is none of them.')
  })

  it('offers the latest edition, which is an address that exists', () => {
    expect(page).toContain('<a class="day day-all" href="/">Latest edition</a>')
  })

  // The sentence and the link were inside `<header class="masthead">`, which
  // made the whole document a banner: a reader navigating by landmark was told
  // this page has no content, and the layout's skip link had nowhere to go.
  it('puts the sentence and the way out in a main', () => {
    expect(page).toContain('<main class="wayout" id="results">')
    expect(page.indexOf('</header>')).toBeLessThan(page.indexOf('<main'))
    expect(page.indexOf('<main')).toBeLessThan(page.indexOf('class="editionbar"'))
  })
})
