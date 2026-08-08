import type { Curation } from './curate'
import { hasMarkupOrUrl } from './sanitize'
import type { RawItem } from './types'

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
  /** The editorial band for items in the world lane. */
  worldMin: number
  worldMax: number
  /** The longest a single description may be, in characters. */
  descriptionMax: number
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

  for (const item of items) {
    if (!byId.has(item.id)) {
      reasons.push(
        `Item ${item.id} is not in the candidate list, so the model invented it.`,
      )
    }

    idCounts.set(item.id, (idCounts.get(item.id) ?? 0) + 1)
    rankCounts.set(item.rank, (rankCounts.get(item.rank) ?? 0) + 1)

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

  for (const [rank, times] of rankCounts) {
    if (times > 1) {
      reasons.push(
        `Rank ${rank} is used by ${plural(times, 'item')}, and every rank must be unique.`,
      )
    }
  }

  // --- the world band ------------------------------------------------------

  // Derived from the candidates by looking each chosen id up, never from
  // anything the model said. The model is not asked which lane an item is in
  // and would not be believed if it were: a curation that claims compliance is
  // exactly the output this gate exists to catch. An id with no candidate
  // counts as nothing here — it is already reported as invented above.
  const worldCount = items.filter((item) => byId.get(item.id)?.lane === 'world').length

  if (worldCount < opts.worldMin) {
    reasons.push(
      `The curation has ${plural(worldCount, 'world item')}, fewer than the minimum of ${opts.worldMin}.`,
    )
  }
  if (worldCount > opts.worldMax) {
    reasons.push(
      `The curation has ${plural(worldCount, 'world item')}, more than the maximum of ${opts.worldMax}.`,
    )
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
