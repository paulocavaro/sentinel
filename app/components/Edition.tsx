// The body of the page: the lead, then the sections.
//
// Structure for structure with `design-refs/build-home.mjs`, which is the
// document the visual gate compares against. All of the grouping lives in
// `lib/themes.ts`; this file is the markup and nothing else, which is what lets
// the section order be tested without rendering a page.
//
// `<main>` is here rather than in `EditionPage` because Task 7's filter is a
// class on `<main>` — the filtered view is CSS over the same server-rendered
// DOM, so the element the class lands on has to be the one that wraps the items.

import { leadOf, sectionsOf } from '@/lib/themes'
import type { Section as SectionModel } from '@/lib/themes'
import type { Edition as EditionModel } from '@/lib/edition'

import { Item } from './Item'

/**
 * One section: the heading, four features, and the rest compact.
 *
 * The id and `aria-labelledby` are load-bearing twice over. They are the
 * heading's association for a screen reader, and they are the anchor the chip
 * row's `href="#ai"` lands on — the no-script path of the theme filter is
 * nothing but these ids, so a section that renders without one degrades to a
 * link that goes nowhere.
 *
 * An unlabelled section has neither, because it has no heading to associate and
 * no chip to be scrolled to: it is the whole of the page.
 */
function Section({ section }: { section: SectionModel }) {
  const { theme, label, features, briefs } = section

  return (
    <section
      className="section"
      id={theme ?? undefined}
      aria-labelledby={theme === null ? undefined : `${theme}-name`}
    >
      {theme === null ? null : (
        <h2 className="section-name" id={`${theme}-name`}>
          {label}
        </h2>
      )}
      <div className="features">
        {features.map((item) => (
          <Item key={item.id} item={item} tier="feature" />
        ))}
      </div>
      {briefs.length > 0 ? (
        <div className="briefs">
          {briefs.map((item) => (
            <Item key={item.id} item={item} tier="brief" />
          ))}
        </div>
      ) : null}
    </section>
  )
}

/**
 * The edition, rendered.
 *
 * The lead sits outside every section: it is the day's one story, and putting
 * it inside its own theme would both bury it and print it twice.
 * `sectionsOf` has already removed it.
 *
 * A section keyed by `theme ?? 'rest'`: the unlabelled group is at most one per
 * page, so the literal is a stable key and not an index.
 */
export function Edition({ edition }: { edition: EditionModel }) {
  const lead = leadOf(edition)
  const sections = sectionsOf(edition)

  return (
    <main>
      {lead === null ? null : <Item item={lead} tier="lead" />}
      {sections.map((section) => (
        <Section key={section.theme ?? 'rest'} section={section} />
      ))}
    </main>
  )
}
