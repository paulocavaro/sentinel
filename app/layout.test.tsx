import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

// next/font/google is a compiler macro, not a runtime module: outside Next's
// build the import resolves to an object whose members are not callable, and
// the layout throws at module scope before a single assertion runs. The mock
// stands in for what the compiler returns — the class name that carries the
// two font variables — because none of that is what this file is about.
vi.mock('next/font/google', () => ({
  Spectral: () => ({ variable: '__variable_spectral' }),
  IBM_Plex_Mono: () => ({ variable: '__variable_plex' }),
}))

const { default: RootLayout } = await import('./layout')

// The root layout, which exists here for one reason: it is the only file every
// route on the site passes through, so it is where the skip link lives.
//
// `/day/2026-08-08` is twenty item links between the masthead and the footer.
// Without a bypass, reaching the end of that page on a keyboard costs twenty
// presses that all go to other people's websites — and the container to land on
// has been sitting in `app/components/Edition.tsx` since it was written,
// carrying a comment calling itself the target for a future skip link.

const html = renderToStaticMarkup

/** `LayoutProps<'/'>`: the root segment takes no params, and still declares them. */
const props = { params: Promise.resolve({}) }

describe('RootLayout', () => {
  const page = html(<RootLayout {...props}>{null}</RootLayout>)

  it('opens the body with the skip link, before anything else', () => {
    expect(page).toContain('<body><a class="skip" href="#results">Skip to the content</a>')
  })

  // Every `<main>` on this site is `#results` — the edition's, the archive's
  // month list, and the five pages that are not an edition — which is what
  // makes one link in the layout honest on every route. The design system's own
  // rule about dead controls is why it could not be a link that works on two of
  // them.
  it('points at the id every page gives its main', () => {
    expect(page).toContain('href="#results"')
  })
})
