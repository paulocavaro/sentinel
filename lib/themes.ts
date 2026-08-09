// How an edition becomes a page: one lead, then a run of sections.
//
// This is the whole of the page's editorial structure, and it is here rather
// than inside a component so it can be read without rendering anything. The
// theme filter, the chip row and the section anchors all agree with the page
// only because they are all derived from these two functions.
//
// It deliberately does not import from `app/`. That used to be enforced by the
// toolchain — vitest ran with no `@/` alias, so a module under `lib/` reaching
// into `app/` simply failed to resolve — and `vitest.config.mts` now configures
// the alias, because the component tests need it. The rule stands on its own
// reasoning instead: a module the page's grouping rules live in should be
// readable by anything, including the generator's descendants.

import type { Edition, EditionItem } from './edition'
import { THEMES } from './ingest/types'
import type { Theme } from './ingest/types'

/**
 * The five section headings, exactly as `design-refs/home.html` prints them.
 *
 * Not abbreviations. `AI` and `World` are the obvious shortenings and both are
 * wrong: the reference sets *Artificial intelligence* and *The world*, and a
 * heading is the one string on the page a reader is guaranteed to read. The
 * record has never called them anything else.
 */
export const THEME_LABELS: Record<Theme, string> = {
  ai: 'Artificial intelligence',
  world: 'The world',
  games: 'Games',
  science: 'Science',
  culture: 'Culture',
}

/**
 * How many items of a section run as features before the rest go compact.
 *
 * Four, because `.features` is a four-column grid at full width: a fifth
 * feature opens a second row with one card in it and three columns of paper
 * beside it. The number is the grid's, so it is named once.
 */
export const FEATURES_PER_SECTION = 4

/**
 * One run of items on the page.
 *
 * `theme` and `label` are null for the single unlabelled group an edition with
 * no themes produces — that shape is not an error path, it is
 * `content/days/2026-08-08.json`, which predates the field and will never be
 * backfilled. A null theme means the section renders with no heading, no id and
 * no `--rule-strong` above it.
 */
export type Section = {
  theme: Theme | null
  label: string | null
  /** The first four, with photographs. */
  features: EditionItem[]
  /** Everything after them, compact. Empty rather than absent for a short run. */
  briefs: EditionItem[]
}

/**
 * The lead: rank 1.
 *
 * The fallback to the first item is not defensive tidiness. `rank` arrives from
 * a JSON file on disk that this module does not write, and an edition whose
 * ranks start at 2 would otherwise render as a page with no lead and its top
 * story sitting fourth in a grid. Position in the array is the pipeline's own
 * order, so the first item is the honest answer when the ranks disagree.
 */
export function leadOf(edition: Edition): EditionItem | null {
  return edition.items.find((item) => item.rank === 1) ?? edition.items[0] ?? null
}

/**
 * The edition below the lead, grouped.
 *
 * Two things this does not do, both of which are the reason it exists:
 *
 *   · **The order is `THEMES`', never the order of appearance.** Section order
 *     is editorial and fixed; reading it off the items would reshuffle the
 *     whole page the day the lead changed theme.
 *   · **The lead is removed before grouping**, so it is not printed twice — once
 *     at the top of the page and once inside its own section. A theme carried
 *     by the lead alone therefore produces no section at all, which is the same
 *     rule as "a theme with no items produces no group", applied after the
 *     removal rather than before it.
 *
 * **Every item below the lead comes out somewhere.** Items with no theme are
 * collected into a trailing unlabelled group rather than skipped, and that is
 * the same group the pre-theme edition is entirely made of — one code path, not
 * a special case bolted beside it. Skipping them is what grouping by the five
 * themes does if you write the obvious version, and it is silent: the closing
 * mark counts `items.length`, so a page that drops one prints a thirty over
 * twenty-nine items. `readableItem` in `lib/edition.ts` drops an unrecognised
 * theme to absent precisely on the promise that the item keeps its place.
 */
export function sectionsOf(edition: Edition): Section[] {
  const lead = leadOf(edition)
  const rest = lead === null ? edition.items : edition.items.filter((item) => item !== lead)

  const themed = THEMES.filter((theme) => rest.some((item) => item.theme === theme)).map((theme) =>
    section(theme, rest.filter((item) => item.theme === theme)),
  )

  const loose = rest.filter((item) => item.theme === undefined)

  return loose.length > 0 ? [...themed, section(null, loose)] : themed
}

function section(theme: Theme | null, items: EditionItem[]): Section {
  return {
    theme,
    label: theme === null ? null : THEME_LABELS[theme],
    features: items.slice(0, FEATURES_PER_SECTION),
    briefs: items.slice(FEATURES_PER_SECTION),
  }
}
