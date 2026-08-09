/**
 * The numbers the pipeline is tuned by, in one place.
 *
 * **This file exists because the same constants were starting to live in three
 * modules at once.** The theme bands and the description cap were hard-coded in
 * `curate.ts` (to write the prompt) and again in the validation options (to
 * enforce it). Changing the band in one place would have asked the model for one
 * range while validating against another, and the symptom is not a type error or
 * a failing test — it is an edition that aborts every morning for a reason
 * nobody can see from the outside.
 *
 * So: nothing downstream keeps a private copy. `curate.ts` and `validate.ts`
 * both take their limits as arguments, and `run.ts` is the only module that
 * reads this file and passes them down.
 */

import type { Theme } from './types'

/**
 * When the edition closes, as the page prints it.
 *
 * A mirror of `.github/workflows/daily.yml`'s `cron: '23 9 * * *'` — 09:23 UTC,
 * deliberately off the top of the hour — and the only copy of that time the
 * site has. No field in an edition carries it: `generatedAt` is when the run
 * happened, which is a minute or two later and drifts with GitHub's scheduler,
 * so printing it would put a different closing time under every edition.
 *
 * It lives here, beside the rest of the pipeline's numbers, rather than in the
 * component that renders it, because the promise in the masthead and the
 * schedule that keeps it are one fact. Two copies is how the page ends up
 * promising a time the job no longer runs at.
 */
export const CLOSING_TIME = '09:23'

/** How far back a candidate may have been published. */
export const WINDOW_HOURS = 48

/** The most items an edition may carry. Fewer is fine; more is a failed run. */
export const TARGET_COUNT = 30

/** Below this an edition is not worth publishing, and the run aborts. */
export const MIN_ITEMS = 12

/**
 * The editorial band for each theme.
 *
 * Minima guarantee presence; maxima carry the reader's priority. A briefing that
 * is only AI news stops being a briefing about the world, and one that is mostly
 * world news stops being this product — the same argument, now in five parts.
 *
 * Asked for in the prompt, enforced in validation. A minimum is softened to what
 * the **candidates** can actually supply, so a day with no games news is a
 * shorter edition rather than an aborted one.
 *
 * `config.test.ts` asserts `sum(min) <= MIN_ITEMS <= TARGET_COUNT <= sum(max)`.
 * Bands whose minima summed above `TARGET_COUNT` would abort every run forever,
 * with a reason that never mentions this file; that has to fail at test time,
 * not at 09:00.
 */
export const THEME_BANDS: Record<Theme, { min: number; max: number }> = {
  ai: { min: 4, max: 14 },
  world: { min: 2, max: 8 },
  games: { min: 2, max: 6 },
  science: { min: 1, max: 5 },
  culture: { min: 1, max: 4 },
}

/** The longest a single item description may be, in characters. */
export const DESCRIPTION_MAX = 200

/**
 * How many sources may return nothing before the run gives up.
 *
 * Not zero: feeds 404, time out and rate-limit routinely, and Hacker News
 * applies its point and time filters server-side, so on a quiet day it can
 * legitimately answer with no hits at all and count as one failure. The number
 * is the line between "the internet was flaky" and "something is actually
 * broken" — past it the candidate pool is too thin to make an honest edition
 * from.
 *
 * Raised from two with the registry at eighteen sources: two of eighteen is a
 * far stricter tolerance than two of eleven was, and tightening the gate was not
 * the point of adding sources.
 */
export const MAX_SOURCE_FAILURES = 3

/** In-flight requests, everywhere in the pipeline. */
export const CONCURRENCY = 6

/** Where editions are committed. One file per UTC date. */
export const CONTENT_DIR = 'content/days'

/** Where re-encoded images are written, served from `/img`. */
export const IMAGE_DIR = 'public/img'
