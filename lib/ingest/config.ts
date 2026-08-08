/**
 * The numbers the pipeline is tuned by, in one place.
 *
 * **This file exists because the same constants were starting to live in three
 * modules at once.** The world band and the description cap were hard-coded in
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

/** How far back a candidate may have been published. */
export const WINDOW_HOURS = 48

/** The most items an edition may carry. Fewer is fine; more is a failed run. */
export const TARGET_COUNT = 20

/** Below this an edition is not worth publishing, and the run aborts. */
export const MIN_ITEMS = 8

/**
 * The editorial band for the world lane.
 *
 * A briefing that is only AI news stops being a briefing about the world, and
 * one that is mostly world news stops being this product. Asked for in the
 * prompt, enforced in validation against the **candidates** — never against
 * anything the model claimed about its own output.
 */
export const WORLD_MIN = 3
export const WORLD_MAX = 6

/** The longest a single item description may be, in characters. */
export const DESCRIPTION_MAX = 200

/**
 * How many sources may return nothing before the run gives up.
 *
 * Not zero: feeds 404, time out and rate-limit routinely, and Hacker News
 * applies its point and time filters server-side, so on a quiet day it can
 * legitimately answer with no hits at all and count as one failure. Two is the
 * line between "the internet was flaky" and "something is actually broken" —
 * past it the candidate pool is too thin to make an honest edition from.
 */
export const MAX_SOURCE_FAILURES = 2

/** In-flight requests, everywhere in the pipeline. */
export const CONCURRENCY = 6

/** Where editions are committed. One file per UTC date. */
export const CONTENT_DIR = 'content/days'

/** Where re-encoded images are written, served from `/img`. */
export const IMAGE_DIR = 'public/img'
