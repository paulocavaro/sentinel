// One item, in the three tiers the page has.
//
// The markup is `design-refs/build-home.mjs`'s, structure for structure: the
// visual gate compares the rendered app against `design-refs/home.html`, so a
// structural difference is a failure even when it looks the same. Three
// differences from the generator are deliberate and listed here rather than
// left to be rediscovered:
//
//   · The generator writes `class="link "` — `link(i, cls = '')` interpolates a
//     modifier that is never passed. Nothing reads the trailing space and no
//     rule in the stylesheet is a second class on `.link`, so it is dropped.
//   · The plate's `src` is `../public/img/…` there, because the reference is a
//     file opened from disk beside `public/`. Here `/img/…` is the served path.
//   · The transforms return React nodes instead of HTML strings. See
//     `lib/typeset.tsx`; that is the whole reason the module exists.
//
// The tiers are not three variants of one shape. A brief has no plate, an
// inline headline, an em dash and a `span.run` instead of a `p.dek`, and no
// lead-in bold — which is why the theme filter cannot re-tier on the client.

import { Byline, leadIn, smallCaps } from '@/lib/typeset'
import type { EditionItem } from '@/lib/edition'

import { Plate } from './Plate'

/** Rank 1 is the lead; the first four of a section are features; the rest run compact. */
export type ItemTier = 'lead' | 'feature' | 'brief'

/**
 * The host, for the screen-reader suffix on the link.
 *
 * Every URL in the archive is absolute and parses — `lib/ingest` only ever
 * writes one that did. The fallback exists because this runs at build time:
 * a single malformed record in one committed edition would otherwise take the
 * whole site down rather than one destination label with it.
 */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * The headline link.
 *
 * `::after` stretches it over the whole `.item`, so the row is the target and
 * the accessible name is still title-plus-destination. The destination is said
 * out loud because the link opens a new tab; the description is deliberately
 * **not** part of the name, which is why the dek and the run sit outside the
 * anchor even though the click target covers them.
 *
 * The suffix is built as one string rather than as text-plus-expression so the
 * streaming renderer never has two adjacent text nodes to separate.
 */
function Headline({ item }: { item: EditionItem }) {
  return (
    <a className="link" href={item.url} target="_blank" rel="noopener noreferrer">
      {smallCaps(item.title)}
      <span className="sr-only">{` (opens at ${hostOf(item.url)})`}</span>
    </a>
  )
}

export function Item({ item, tier }: { item: EditionItem; tier: ItemTier }) {
  // The summary runs on after an em dash rather than opening a block of its
  // own, which is how thirty attributed items fit on a screen without a card.
  // No lead-in bold here: the generator bolds the first two words of a `dek`
  // and never of a `run`, because at this size the entry would be most of the
  // line.
  if (tier === 'brief') {
    return (
      <article className="item brief">
        <div className="body">
          <Byline>{item.publisher}</Byline>
          <h3 className="head">
            <Headline item={item} />
          </h3>
          <span className="dash" aria-hidden="true">{' — '}</span>
          <span className="run">{smallCaps(item.description)}</span>
        </div>
      </article>
    )
  }

  if (tier === 'lead') {
    return (
      <article className="item lead">
        <Plate image={item.image} variant="lead" />
        <div className="body">
          <Byline>{item.publisher}</Byline>
          <h2 className="head">
            <Headline item={item} />
          </h2>
          <p className="dek">{leadIn(item.description)}</p>
        </div>
      </article>
    )
  }

  return (
    <article className="item feature">
      <Plate image={item.image} variant="feature" />
      <div className="body">
        <Byline>{item.publisher}</Byline>
        <h3 className="head">
          <Headline item={item} />
        </h3>
        <p className="dek">{leadIn(item.description)}</p>
      </div>
    </article>
  )
}
