import type { Curation } from './curate'
import { hasMarkupOrUrl } from './sanitize'
import { THEMES, themeSupply } from './types'
import type { RawItem, Theme } from './types'

/**
 * The last gate before anything is published.
 *
 * Nothing downstream of this function has a human in it: a valid curation is
 * assembled, written to the repository and deployed by a scheduled job while
 * nobody is awake. So this is where an invented item, a manipulated ranking or
 * a description carrying a link has to be caught — there is no later stage that
 * would notice.
 *
 * `validateCuration` returns reasons rather than throwing, and collects **all**
 * of them rather than stopping at the first. A run that aborts is read once, in
 * a GitHub issue, by somebody with no context; giving them the whole picture in
 * one pass is the difference between one failed edition and three.
 *
 * An empty array means valid. Any entry means the run must write nothing and
 * exit non-zero, leaving the previous edition live.
 */

export type ValidateOptions = {
  /** The most items an edition may carry. */
  targetCount: number
  /** The fewest items that still make an edition worth publishing. */
  minItems: number
  /** The editorial band for each theme. */
  bands: Record<Theme, { min: number; max: number }>
  /** The longest a single description may be, in characters. */
  descriptionMax: number
}

function isTheme(value: string): value is Theme {
  return (THEMES as readonly string[]).includes(value)
}

/**
 * `hasMarkupOrUrl` (Task 2) flags `https?://`, `www.`, `<…>` and `](`. It is
 * built for feed text, which arrives before `sanitizeText` has run. Model text
 * is different in two ways, and both are handled here rather than by changing
 * that function's contract — feed sanitization and editorial validation are not
 * the same job and should not drift together.
 *
 * 1. **Entity-encoded markup.** Model output is not entity-encoded, so this is
 *    belt and braces, but `&lt;img onerror=…&gt;` costs one regex to catch and
 *    has no legitimate place in a plain-prose sentence.
 * 2. **Scheme-less links.** `//host/path` and `host.tld/path` are unambiguously
 *    links and never appear in prose.
 *
 * A **bare domain** — `evil.com` with no path — is deliberately still allowed.
 * In an AI briefing it is indistinguishable from a product name: `Character.AI`,
 * `Perplexity.ai`, `Hugging Face` on `.co`, `vercel.app`. Flagging it would mean
 * losing whole editions to sentences that are simply correct, and a bare domain
 * is inert: it carries no markup and, rendered as text by React, is not a link.
 * That last clause is the assumption. **If a later phase ever autolinks
 * descriptions, this decision has to be revisited** — at that point a bare
 * domain becomes a clickable attacker-controlled destination.
 */
const PROTOCOL_RELATIVE = /\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+/i

/**
 * The TLDs worth spending a false positive on, and only ever with a path after
 * them. Requiring the path is what keeps `Character.AI` and `Node.js/npm` out
 * of this: a product name is not followed by a slash and a route.
 */
const LINK_TLDS =
  'com|net|org|io|ai|co|dev|app|me|info|biz|xyz|top|site|online|link|click|ru|cn|uk|de|fr|jp|br|in|us|eu|gg|sh|to|ly|st|cc'

const DOMAIN_WITH_PATH = new RegExp(
  `\\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\\.[a-z0-9-]+)*\\.(?:${LINK_TLDS})/\\S`,
  'i',
)

/** `<`, `>` and `&`, named or numeric. Narrow on purpose: `AT&T` must pass. */
const ENCODED_MARKUP = /&(?:lt|gt|amp|#0*(?:60|62|38)|#x0*(?:3c|3e|26));/i

/** True when model-authored editorial text carries a link or markup. */
function hasLinkOrMarkup(text: string): boolean {
  return (
    hasMarkupOrUrl(text) ||
    PROTOCOL_RELATIVE.test(text) ||
    DOMAIN_WITH_PATH.test(text) ||
    ENCODED_MARKUP.test(text)
  )
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

const TEXT_RULE = 'editorial text must be plain prose'

export function validateCuration(
  curation: Curation,
  candidates: readonly RawItem[],
  opts: ValidateOptions,
): string[] {
  const reasons: string[] = []
  const items = curation.items
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]))

  // --- how many items ------------------------------------------------------

  if (items.length > opts.targetCount) {
    reasons.push(
      `The curation has ${plural(items.length, 'item')}, more than the target of ${opts.targetCount}.`,
    )
  }
  if (items.length < opts.minItems) {
    reasons.push(
      `The curation has ${plural(items.length, 'item')}, fewer than the minimum of ${opts.minItems}.`,
    )
  }

  // --- each item, and the text that comes with it --------------------------

  const idCounts = new Map<string, number>()
  const rankCounts = new Map<number, number>()
  const themeCounts = new Map<Theme, number>()

  for (const item of items) {
    const candidate = byId.get(item.id)

    if (!candidate) {
      reasons.push(
        `Item ${item.id} is not in the candidate list, so the model invented it.`,
      )
    }

    idCounts.set(item.id, (idCounts.get(item.id) ?? 0) + 1)
    rankCounts.set(item.rank, (rankCounts.get(item.rank) ?? 0) + 1)

    // --- the theme, in two steps ------------------------------------------
    //
    // The schema lets any string through on purpose (see `CurationSchema`), so
    // the enum check is here, where one badly-cased theme is one reported item
    // rather than a `NoObjectGeneratedError` that costs the whole edition.
    //
    // The allowlist check is the one that matters. The theme is the only field
    // of the published item the model decides for itself, so it is bounded by
    // the source registry: Eurogamer cannot supply a science item and a model
    // that says otherwise is overruled here.
    if (!isTheme(item.theme)) {
      reasons.push(
        `Item ${item.id} has the theme "${item.theme}", which is not one of ${THEMES.join(', ')}.`,
      )
    } else {
      themeCounts.set(item.theme, (themeCounts.get(item.theme) ?? 0) + 1)

      if (candidate && !candidate.themes.includes(item.theme)) {
        reasons.push(
          `Item ${item.id} is filed under "${item.theme}", which its source does not allow (${candidate.themes.join(', ')}).`,
        )
      }
    }

    const description = item.description.trim()
    if (description.length === 0) {
      reasons.push(`Item ${item.id} has a blank description.`)
    } else if (description.length > opts.descriptionMax) {
      reasons.push(
        `Item ${item.id} has a description of ${plural(description.length, 'character')}, over the limit of ${opts.descriptionMax}.`,
      )
    }
    if (hasLinkOrMarkup(item.description)) {
      reasons.push(`Item ${item.id} has a description containing a link or markup, and ${TEXT_RULE}.`)
    }

    // One reason per item, not one per topic: three bad topics on one item is
    // the same problem reported three times.
    if (item.topics.some(hasLinkOrMarkup)) {
      reasons.push(`Item ${item.id} has a topic containing a link or markup, and ${TEXT_RULE}.`)
    }
  }

  for (const [duplicateId, times] of idCounts) {
    if (times > 1) {
      reasons.push(
        `Item ${duplicateId} appears ${plural(times, 'time')} in the curation, and an item may appear only once.`,
      )
    }
  }

  let ranksAreUnique = true
  for (const [rank, times] of rankCounts) {
    if (times > 1) {
      ranksAreUnique = false
      reasons.push(
        `Rank ${rank} is used by ${plural(times, 'item')}, and every rank must be unique.`,
      )
    }
  }

  // Uniqueness alone let `1, 2, 3, 5, 7` through, and the prompt has always
  // asked for no gaps: rank is the edition's running order, so a hole in it is
  // either an item the model dropped after ranking it or a ranking it never
  // really made. `buildEdition` sorts on rank and would publish the sequence
  // unquestioned.
  //
  // Only checked when the ranks are unique. A duplicate necessarily creates a
  // gap, and reporting both would state one defect twice.
  if (ranksAreUnique) {
    const missing = Array.from({ length: items.length }, (_, index) => index + 1).filter(
      (rank) => !rankCounts.has(rank),
    )

    if (missing.length > 0) {
      reasons.push(
        `The curation's ${plural(items.length, 'item')} must be ranked 1 to ${items.length} with no gaps, but ${missing.length === 1 ? 'rank' : 'ranks'} ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} missing.`,
      )
    }
  }

  // --- the theme bands -----------------------------------------------------

  // The band is checked against the themes the model assigned, which is sound
  // only because every one of those assignments has just been checked against
  // the candidate's own allowlist: the model chooses within a set the source
  // registry decided, and cannot widen it.
  //
  // The minimum is softened to what the pool can actually supply, and **supply
  // is recomputed here from the candidates** rather than taken as an argument.
  // A caller passing a supply the model influenced is exactly the failure this
  // gate exists to catch, and the candidates are already in hand. A day with
  // two games stories publishes both and is a correct edition; a day with none
  // publishes no games and is also correct.
  const supply = themeSupply(candidates)

  for (const theme of THEMES) {
    const band = opts.bands[theme]
    const count = themeCounts.get(theme) ?? 0
    const effectiveMin = Math.min(band.min, supply[theme])

    if (count < effectiveMin) {
      reasons.push(
        `The curation has ${plural(count, `${theme} item`)}, fewer than the ${effectiveMin} the pool could supply.`,
      )
    }
    if (count > band.max) {
      reasons.push(
        `The curation has ${plural(count, `${theme} item`)}, more than the maximum of ${band.max}.`,
      )
    }
  }

  // --- the edition summary -------------------------------------------------

  if (curation.summary.trim().length === 0) {
    reasons.push('The edition summary is blank.')
  }
  if (hasLinkOrMarkup(curation.summary)) {
    reasons.push(`The edition summary contains a link or markup, and ${TEXT_RULE}.`)
  }

  return reasons
}
