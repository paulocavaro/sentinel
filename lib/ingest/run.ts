import { buildEdition, editionExists, readPublished, writeEdition } from './archive'
import {
  CONCURRENCY,
  DESCRIPTION_MAX,
  MAX_SOURCE_FAILURES,
  MIN_ITEMS,
  TARGET_COUNT,
  WINDOW_HOURS,
  WORLD_MAX,
  WORLD_MIN,
} from './config'
import { curate } from './curate'
import type { Curation, Generator, PromptOptions } from './curate'
import { collect } from './fetch'
import type { Fetcher } from './fetch'
import { downloadImages, resolveImages } from './images'
import type { BytesFetcher, HtmlFetcher } from './images'
import { selectCandidates } from './select'
import { SOURCES } from './sources'
import type { Edition, RawItem, Source } from './types'
import { validateCuration } from './validate'
import type { ValidateOptions } from './validate'

/**
 * The whole pipeline, in one function that never throws.
 *
 * Two properties matter more than anything else here, and both are behavioural
 * rather than structural — which is why they are tested rather than argued for:
 *
 * 1. **A run that fails writes nothing.** Not a partial edition, not an orphan
 *    image. Every abort happens before the first byte is written, so a bad day
 *    leaves yesterday's edition live and the site simply does not change.
 * 2. **A second run of the day costs nothing.** The existence check comes before
 *    the model call, so a retried job, a double-triggered schedule or an
 *    operator running the script twice does not spend a curation.
 *
 * Every boundary is injected — the feed reader, the model, the two image
 * readers, the clock and both directories. `runIngest` itself opens no socket
 * and reads no environment variable, which is what lets the exit-code contract
 * be tested in full without a network or an API key.
 *
 * Failures never propagate as exceptions. `scripts/ingest.ts` is a thin adapter
 * whose only job is to print the result and exit with `code`; an unhandled
 * rejection escaping this function would become a stack trace and an exit status
 * nobody chose.
 */

export type IngestDeps = {
  /** Reads one feed body. Rejecting is an ordinary outcome. */
  fetcher: Fetcher
  /** The model call. `(prompt) => Curation`. */
  generate: Generator
  /** Reads an article page, for items whose feed carried no image. */
  fetchHtml: HtmlFetcher
  /** Reads image bytes. */
  fetchImage: BytesFetcher
  /** Injected clock. Called once per run, so every timestamp agrees. */
  now: () => Date
  /** Where editions are read from and written to. */
  contentDir: string
  /** Where re-encoded images are written. */
  imageDir: string
  /** Defaults to the real registry; injected by tests. */
  sources?: readonly Source[]
}

export type IngestOptions = {
  /** Rebuild today's edition even though one already exists. */
  force?: boolean
  /** Curate and report, but write nothing at all. */
  dryRun?: boolean
}

export type IngestResult = {
  /** The process exit code. 0 is a good run — including one that wrote nothing. */
  code: number
  wrote: boolean
  /**
   * Why the run ended as it did, in whole sentences. Non-empty on every failure,
   * and also on the benign no-write outcomes (the edition already existed, or it
   * was a dry run) so the job summary can always say what happened.
   */
  reasons: string[]
  /** The UTC date the run covers. */
  date: string
  /** How many candidates survived selection. */
  candidateCount: number
  /**
   * Items dropped because their publish date could not be read.
   *
   * Carried out rather than swallowed: it is the only signal that a feed's dates
   * have stopped parsing, which otherwise reads as "that source had a quiet day".
   */
  unparseable: number
  /**
   * Ids of the sources that returned nothing. Reported even on a successful run:
   * Hacker News filters by points and time server-side, so a quiet hour there is
   * a legitimate empty response, and a source that has been silently failing for
   * a week should be visible before it takes the run past the tolerance.
   */
  failures: string[]
  /** The assembled edition, including on a dry run. Null when the run aborted. */
  edition: Edition | null
  /** Where the edition was written, or null when nothing was written. */
  path: string | null
}

/**
 * The limits, read from `config.ts` and passed down. Neither `buildPrompt` nor
 * `validateCuration` keeps a copy: the prompt has to ask for exactly what the
 * gate enforces, and two drifting sets of numbers would abort every run with no
 * explanation anywhere in the output.
 */
const PROMPT_OPTIONS: PromptOptions = {
  targetCount: TARGET_COUNT,
  worldMin: WORLD_MIN,
  worldMax: WORLD_MAX,
  descriptionMax: DESCRIPTION_MAX,
}

const VALIDATE_OPTIONS: ValidateOptions = { ...PROMPT_OPTIONS, minItems: MIN_ITEMS }

/** Editions are named by the UTC date they cover, everywhere and always. */
function utcDate(now: Date): string {
  return now.toISOString().slice(0, 10)
}

function explain(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function runIngest(
  deps: IngestDeps,
  opts: IngestOptions = {},
): Promise<IngestResult> {
  const sources = deps.sources ?? SOURCES
  const now = deps.now()
  const date = utcDate(now)

  // Filled in as the run progresses, so a result assembled at any exit point
  // carries whatever was learned before it.
  let candidateCount = 0
  let unparseable = 0
  let failures: string[] = []

  const done = (outcome: {
    code: number
    wrote: boolean
    reasons: string[]
    edition?: Edition
    path?: string
  }): IngestResult => ({
    code: outcome.code,
    wrote: outcome.wrote,
    reasons: outcome.reasons,
    date,
    candidateCount,
    unparseable,
    failures,
    edition: outcome.edition ?? null,
    path: outcome.path ?? null,
  })

  try {
    // --- idempotence -------------------------------------------------------

    // Before anything else, and specifically before the model call. This is the
    // cheapest guard in the pipeline and the one that protects the largest cost.
    if (!opts.force && (await editionExists(deps.contentDir, date))) {
      return done({
        code: 0,
        wrote: false,
        reasons: [
          `The edition for ${date} already exists, so this run stopped before curating. Pass --force to rebuild it.`,
        ],
      })
    }

    // --- collect -----------------------------------------------------------

    const published = await readPublished(deps.contentDir)
    const since = new Date(now.getTime() - WINDOW_HOURS * 3_600_000)

    const collected = await collect(sources, deps.fetcher, { since, concurrency: CONCURRENCY })
    failures = collected.failures

    if (failures.length > MAX_SOURCE_FAILURES) {
      return done({
        code: 1,
        wrote: false,
        reasons: [
          `${failures.length} of ${sources.length} sources returned nothing (${failures.join(', ')}), more than the ${MAX_SOURCE_FAILURES} a run tolerates. The pool is too thin for an honest edition, so nothing was curated or written.`,
        ],
      })
    }

    // --- select ------------------------------------------------------------

    const selected = selectCandidates(collected.items, {
      now,
      windowHours: WINDOW_HOURS,
      published,
    })
    const candidates = selected.candidates
    candidateCount = candidates.length
    unparseable = selected.unparseable

    // Validation would reject a curation this short anyway. Checking here as
    // well is purely about not paying for a model call whose result cannot
    // possibly be published.
    if (candidateCount < MIN_ITEMS) {
      return done({
        code: 1,
        wrote: false,
        reasons: [
          `Only ${candidateCount} candidates survived selection, fewer than the ${MIN_ITEMS} an edition needs. The model was not called.`,
        ],
      })
    }

    // --- curate ------------------------------------------------------------

    let curation: Curation
    try {
      // `curate` already retries once. Reaching this catch means two failures.
      curation = await curate(candidates, PROMPT_OPTIONS, deps.generate)
    } catch (error) {
      return done({
        code: 1,
        wrote: false,
        reasons: [
          `The curation call failed, including its retry: ${explain(error)}. A refusal, a sustained rate limit and an outage all land here.`,
        ],
      })
    }

    // --- validate ----------------------------------------------------------

    const reasons = validateCuration(curation, candidates, VALIDATE_OPTIONS)
    if (reasons.length > 0) {
      // Nothing has been written at this point and nothing will be. Images are
      // downloaded *after* this gate for exactly that reason: a run rejected
      // here leaves not even an orphan file behind.
      return done({ code: 1, wrote: false, reasons })
    }

    // --- images, for the curated items only --------------------------------

    // Every id resolves — validation just proved it — but the lookup is written
    // to survive one that does not rather than to assume.
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]))
    const chosen = curation.items
      .map((item) => byId.get(item.id))
      .filter((candidate): candidate is RawItem => candidate !== undefined)

    if (opts.dryRun) {
      return done({
        code: 0,
        wrote: false,
        reasons: ['Dry run: the edition was curated and validated, but nothing was written.'],
        edition: buildEdition(curation, candidates, {
          date,
          generatedAt: now.toISOString(),
          targetCount: TARGET_COUNT,
          images: new Map(),
        }),
      })
    }

    // Scoped to `chosen`, never to `candidates`. There are roughly three times
    // as many candidates as an edition holds, and each one would otherwise cost
    // an article-page read and an image download against a host named by an
    // untrusted feed.
    const resolved = await resolveImages(chosen, deps.fetchHtml)
    const images = await downloadImages(resolved, deps.imageDir, deps.fetchImage)

    // --- write -------------------------------------------------------------

    const edition = buildEdition(curation, candidates, {
      date,
      generatedAt: now.toISOString(),
      targetCount: TARGET_COUNT,
      images,
    })

    const path = await writeEdition(deps.contentDir, edition)

    return done({ code: 0, wrote: true, reasons: [], edition, path })
  } catch (error) {
    // The backstop. A disk error, a bug in assembly, anything unforeseen — it
    // becomes a reason and exit code 1, and the previous edition stays live.
    return done({
      code: 1,
      wrote: false,
      reasons: [`The run failed unexpectedly: ${explain(error)}`],
    })
  }
}
