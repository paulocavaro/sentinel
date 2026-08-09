// The theme filter: the chip row, and the one class that filters the page.
//
// The whole design of this file is an argument about where the filtered state
// lives, so it is written down rather than left in the diff:
//
//   · **The state is the URL.** `useSearchParams` is read on every render and
//     the active theme is derived from it. Nothing is copied into `useState`,
//     because a mirror is only correct until something else moves the URL — and
//     the back button is exactly that. Mirrored, Back rewrites the address bar
//     and leaves the list filtered by a theme the URL no longer names.
//   · **The parameter is clamped against the edition's own themes**, not
//     against the five in `types.ts`. `?theme=sports`, `?theme=`, a repeated
//     `?theme=ai&theme=world`, and `?theme=games` on the pre-theme edition all
//     resolve to "no filter". Unclamped, the URL is the door that the derived
//     chip row — which never prints a chip for a theme with no items — was
//     locked to prevent: a masthead, an empty page, and a closing mark still
//     counting thirty.
//   · **The filter is two classes on `<main>`**, applied here and read by the
//     stylesheet. The alternative — re-tiering the items to briefs — is a
//     different DOM per item, so it would make every item a client component to
//     do on the client, and make the route dynamic to do on the server. The
//     page stays one prerendered document and the filtered view is CSS over it.
//     See the filtered-view block in `app/globals.css`.
//   · **`<Suspense>` is not optional.** In Next 16 a client component that
//     calls `useSearchParams` inside a prerendered route is a *build* error, not
//     a bailout, and `next dev` renders on demand — so the boundary looks
//     unnecessary right up until the gate fails. The fallback is the same chip
//     row with nothing selected: it is what the prerendered HTML contains, so a
//     reader with no JavaScript gets a working row of anchors rather than a
//     band that appears a beat late.
//
// The difference from `design-refs/build-home.mjs` is behaviour only. The
// markup is the reference's, chip for chip, including the query the reference's
// own anchors now carry.

'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { ReadonlyURLSearchParams } from 'next/navigation'
import { Suspense, useEffect } from 'react'

import type { Theme } from '@/lib/ingest/types'
import { THEME_LABELS } from '@/lib/themes'

/**
 * One chip: a theme the edition actually carries, and how many items sit under
 * it below the lead.
 *
 * The count is the section's, not the theme's, because the section is what the
 * filtered view shows — the lead is hidden with everything else, and a count
 * that included it would be one higher than the list underneath it. From a
 * composed page it is `sectionsOf(edition)`:
 *
 *     sectionsOf(edition)
 *       .filter((s) => s.theme !== null)
 *       .map((s) => ({ theme: s.theme, count: s.features.length + s.briefs.length }))
 */
export type ThemeCount = { theme: Theme; count: number }

/**
 * The id `Edition` gives its `<main>`. It is the results container: the element
 * the classes land on, and the target for a future skip link, which is why it
 * also carries `tabIndex={-1}`.
 *
 * Not imported from `Edition.tsx` and not exported to it: every export of a
 * `'use client'` module is a client reference on the server, so a server
 * component reading a constant across this boundary reads a proxy. The string
 * is written twice and named in both comments instead.
 */
const RESULTS = 'results'

/**
 * The theme named by the URL, or null for every other case.
 *
 * `getAll` rather than `get`: `?theme=ai&theme=world` is a real URL a reader
 * can produce by hand, and `get` would answer `'ai'` and filter to a page the
 * address bar does not describe. More than one value is an instruction this
 * control cannot carry out, so it carries out none of it.
 *
 * The membership test is against the chips, which are derived from the
 * edition's items, so it clamps the unknown theme (`sports`), the empty value
 * (`?theme=`) and the theme that is real but absent from *this* edition
 * (`?theme=games` on 8 August, which predates the field entirely) in one line.
 */
function activeTheme(params: ReadonlyURLSearchParams, themes: ThemeCount[]): Theme | null {
  const named = params.getAll('theme')
  if (named.length !== 1) return null

  return themes.find((chip) => chip.theme === named[0])?.theme ?? null
}

/** What the live region says. The unfiltered sentence exists so clearing announces something. */
function announcement(shown: ThemeCount | undefined): string {
  if (shown === undefined) return 'Showing the whole edition.'

  const items = shown.count === 1 ? '1 item' : `${shown.count} items`
  return `Showing ${items} in ${THEME_LABELS[shown.theme]}.`
}

/**
 * The row itself, rendered identically for the fallback and for the hydrated
 * component — the fallback is this with nothing selected, so the swap changes
 * two attributes and no layout.
 *
 * `aria-current` is present only on the selected chip. Passing `false` would
 * render the string `"false"`, which is ARIA's value for *not* current and
 * which the stylesheet already guards against; passing nothing is the version
 * that does not need the guard.
 *
 * The selected chip's href drops the parameter and keeps the fragment, so the
 * one control the row has can be turned off by the same click that turned it
 * on. Both hrefs degrade: with no script `?theme=ai#ai` and `?#ai` are both
 * links to a section that is still on the page.
 */
function Row({ themes, active }: { themes: ThemeCount[]; active: Theme | null }) {
  return (
    <nav aria-label="Themes">
      <ul className="themes">
        {/* First, and a control rather than a theme. Clearing a filter was only
            possible by clicking the selected chip a second time — true, reversible
            and undiscoverable, because nothing on screen says so. This says it.
            It carries `aria-current` when nothing is filtered, so the row always
            has exactly one current chip and a screen reader always has an anchor;
            before, the unfiltered page had none. */}
        <li>
          <Link
            className="chip"
            href="?#results"
            scroll={false}
            aria-current={active === null ? 'true' : undefined}
          >
            Everything
          </Link>
        </li>
        {themes.map(({ theme }) => (
          <li key={theme}>
            <Link
              className="chip"
              href={theme === active ? `?#${theme}` : `?theme=${theme}#${theme}`}
              scroll={false}
              aria-current={theme === active ? 'true' : undefined}
            >
              {THEME_LABELS[theme]}
            </Link>
          </li>
        ))}
      </ul>
      {/* Beside the chips rather than inside the list: the list is replaced
          silently otherwise — the items change and a screen reader is told
          nothing at all. */}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement(themes.find((chip) => chip.theme === active))}
      </p>
    </nav>
  )
}

/**
 * The hydrated row. The only thing it does beyond `Row` is put the classes on
 * the results container.
 *
 * Written as an effect on an element this component does not render, which is
 * unusual enough to justify: `<main>` belongs to `Edition`, a server component,
 * and it has to, because it wraps the items and the whole point is that they
 * are server-rendered. React never sets a `className` on that element, so
 * nothing here is fighting the renderer, and the cleanup removes exactly the
 * two classes it added — the next run puts the next pair on. When `active` is
 * null no class is added and the previous cleanup has already run, which is the
 * unfiltered page.
 */
function Filter({ themes }: { themes: ThemeCount[] }) {
  const active = activeTheme(useSearchParams(), themes)

  useEffect(() => {
    const results = document.getElementById(RESULTS)
    if (results === null || active === null) return

    const classes = ['is-filtered', `filter-${active}`]
    results.classList.add(...classes)
    return () => results.classList.remove(...classes)
  }, [active])

  return <Row themes={themes} active={active} />
}

/**
 * The chip row, filtering.
 *
 * No themes, no row — the reference makes the same decision for the same
 * reason: a control that filters to nothing is worse than an absent one, and
 * the edition of 8 August carries no themes at all. It also means `?theme=`
 * anything on that page reaches no code and renders the whole edition.
 */
export function ThemeFilter({ themes }: { themes: ThemeCount[] }) {
  if (themes.length === 0) return null

  return (
    <Suspense fallback={<Row themes={themes} active={null} />}>
      <Filter themes={themes} />
    </Suspense>
  )
}
