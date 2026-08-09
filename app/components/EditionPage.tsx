// An edition, as a whole page.
//
// **Both routes render this.** `/` reads the latest edition and `/day/[date]`
// reads the one it was asked for, and neither knows anything about layout: the
// difference between the front page and an archive day is entirely which
// edition and which day it is about. The alternative — the day route rendering
// "exactly like" the home route — is a copy, and a copy drifts on the first
// change, silently, in the one place the visual gate only checks at one width.
//
// The markup is `design-refs/build-home.mjs`'s `<body>`, structure for
// structure. Two orderings differ from the reference and neither is visible:
//
//   · The reference puts the `.ask-fab` button first in `<body>` and its
//     `<dialog>` between `<main>` and the footer, because a static file has to
//     wire them together by id. Here they are one component and one client
//     boundary, rendered after the closing block — both are `position: fixed`,
//     so document order is only what a reader arrives at last, and a reader who
//     has finished the day is exactly who the button is for.
//   · The stale banner has no counterpart in `home.html` at all: it is
//     `states.html` 01, above the masthead, inside the page column.

import { editionDate, shiftDays } from '@/lib/date'
import { isThin } from '@/lib/edition'
import type { Edition as EditionModel } from '@/lib/edition'
import { CLOSING_TIME } from '@/lib/ingest/config'
import { sectionsOf } from '@/lib/themes'
import { capitalise, inWords } from '@/lib/words'

import { AskButton } from './AskButton'
import { Edition } from './Edition'
import { EditionBar } from './EditionBar'
import { Masthead } from './Masthead'
import { StaleBanner } from './StaleBanner'
import { ThemeFilter } from './ThemeFilter'
import type { ThemeCount } from './ThemeFilter'

/**
 * The chips, derived from the page's own sections.
 *
 * This is the expression `ThemeFilter`'s `ThemeCount` doc comment names, with
 * one change: `flatMap` rather than `filter` then `map`, because `filter` does
 * not narrow `Section['theme']` from `Theme | null` to `Theme` and the `map`
 * after it would need a non-null assertion to typecheck. Same result, no
 * assertion.
 *
 * Derived from `sectionsOf` rather than from `themesOf(edition)` so the chip
 * row can never name a theme the page has no section for: the lead is removed
 * before grouping, so a theme carried by the lead alone produces no section,
 * and a chip for it would filter to an empty page. The count is the section's
 * for the same reason — the filtered view hides the lead with everything else.
 */
function chipsOf(edition: EditionModel): ThemeCount[] {
  return sectionsOf(edition).flatMap((section) =>
    section.theme === null
      ? []
      : [{ theme: section.theme, count: section.features.length + section.briefs.length }],
  )
}

/**
 * The closing sentence.
 *
 * One string rather than a sentence beside an expression: adjacent text nodes
 * are separated by a `<!-- -->` marker in the streamed HTML and the reference
 * has one text node here, the same reason `Masthead` builds its promise line
 * this way.
 *
 * On a thin day it spells the count — *"Seventeen items — the window was
 * thin."*, `states.html` 02. Spelled rather than printed because this is prose:
 * the masthead's `.promise` is a machine-face label two inches up the page and
 * says `17 items`, and the split between the two is the whole reason
 * `lib/words.ts` exists. The count is `items.length` there and here, so the two
 * sentences cannot disagree.
 */
function closingSentence(edition: EditionModel): string {
  const count = edition.items.length

  return [
    `That was ${editionDate(edition.date)}.`,
    ...(isThin(edition)
      ? [`${capitalise(inWords(count))} ${count === 1 ? 'item' : 'items'} — the window was thin.`]
      : []),
  ].join(' ')
}

/**
 * The end of the edition.
 *
 * Its own export because `/states` frames it on its own — the thin day is
 * `states.html` 02, which is a masthead and a closing block and nothing in
 * between, and the sentence it turns on is `closingSentence` above. A second
 * copy of that footer in the catalogue would be a copy of the one piece of
 * markup on the page whose text is conditional, i.e. the one most worth
 * checking and the one most likely to drift.
 */
export function CloseBlock({ edition }: { edition: EditionModel }) {
  return (
    <footer className="close">
      {/* The mark is `items.length`, never `TARGET_COUNT`: a thin day that
          printed thirty over seventeen items would be the page contradicting
          itself in its largest type. `aria-hidden` because it is a printer's
          mark — "-30-" read aloud is noise, and the sentence under it already
          says the edition has ended. */}
      <p className="close-mark" aria-hidden="true">{`-${edition.items.length}-`}</p>
      <p className="close-sentence">{closingSentence(edition)}</p>
      <p className="close-next">{`Next edition ${CLOSING_TIME} tomorrow`}</p>
      <span className="sr-only">End of edition.</span>
    </footer>
  )
}

/**
 * @param edition  the edition on screen.
 * @param dates    every date the archive can render, for the edition bar's
 *   neighbours. `listEditionDates()`.
 * @param today    the calendar date this page is meant to be current for, in
 *   UTC, or **null when the page is not about today at all**.
 *
 *   Required rather than optional, and nullable rather than absent, because the
 *   stale banner is the one thing on this page a route can forget. `/` passes
 *   the build's own UTC date: the banner then falls out of the data — the newest
 *   edition is rendered, its date is compared to today's, and if they differ the
 *   banner appears. `/day/[date]` passes null: an archive day asked for by name
 *   is never stale, it is simply that day, and a banner there would tell a
 *   reader of 8 August that today's edition did not build.
 *
 *   Note what this cannot fix: on a prerendered route "today" is frozen at build
 *   time, and nothing rebuilds the site unless the ingest succeeds — which is
 *   the exact scenario the banner exists for. That is Task 11's subject, and it
 *   is a deployment problem, not this component's.
 */
export function EditionPage({
  edition,
  dates,
  today,
}: {
  edition: EditionModel
  dates: readonly string[]
  today: string | null
}) {
  const stale = today !== null && edition.date !== today

  return (
    <div className="page">
      {stale ? <StaleBanner edition={edition} nextRun={shiftDays(today, 1)} /> : null}

      {/* The bar and the chip row are the masthead's children because they are
          inside `<header class="masthead">` in the reference. The masthead
          holds the slot rather than importing either: the bar is a server
          component and the filter is a client one, and neither is the
          masthead's business. */}
      <Masthead edition={edition}>
        <EditionBar date={edition.date} dates={dates} home={today !== null} />
        <ThemeFilter themes={chipsOf(edition)} />
      </Masthead>

      <Edition edition={edition} />

      <CloseBlock edition={edition} />

      <AskButton editions={dates.length} />
    </div>
  )
}
