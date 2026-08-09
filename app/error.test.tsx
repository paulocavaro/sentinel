import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import Error from './error'

// The one surface the reader can reach that the design never drew. It replaces
// the whole route, which is what makes its landmarks worth a test of their own:
// whatever the failed page was going to be, this is all the reader gets.

const html = renderToStaticMarkup

describe('Error', () => {
  const page = html(<Error error={Object.assign(new globalThis.Error('boom'), { digest: 'a1b2' })} />)

  // The digest is the only thing that connects what the reader saw to a line in
  // a log, so it is printed rather than swallowed.
  it('names the failure by its digest', () => {
    expect(page).toContain('<p class="promise">Failure a1b2</p>')
  })

  it('says "Failure" and nothing more when there is no digest', () => {
    expect(html(<Error error={new globalThis.Error('boom')} />)).toContain(
      '<p class="promise">Failure</p>',
    )
  })

  // Inside the header this page was a banner from its first element to its
  // last — a document with no content, on the one route where the reader most
  // needs to be told what happened and where to go.
  it('puts the sentence and the way back in a main', () => {
    expect(page).toContain('<main class="wayout" id="results">')
    expect(page.indexOf('</header>')).toBeLessThan(page.indexOf('<main'))
    expect(page).toContain('<a class="day day-all" href="/">Latest edition</a>')
  })
})
