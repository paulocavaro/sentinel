/**
 * The command line adapter. `pnpm ingest [--force] [--dry-run]`.
 *
 * Everything this file does is argv in, real dependencies assembled, summary
 * printed, exit code set. There is no pipeline logic here on purpose: `runIngest`
 * owns the whole run and never throws, and its exit-code contract is covered by
 * `lib/ingest/run.test.ts`. Anything that moved into this file would be logic
 * with no test around it, verified only by a human reading terminal output —
 * which is exactly the gap Task 12 exists to close.
 *
 * Two conventions worth knowing before editing:
 *
 * 1. **Relative imports, never the `@/*` alias.** `tsx` does not read
 *    `tsconfig.json`'s `paths` without `tsconfig-paths` wired in, and the alias
 *    would fail at runtime while typechecking cleanly — a break that only shows
 *    up in the scheduled job. Relative imports avoid the problem instead of
 *    solving it.
 * 2. **The summary goes to stdout, the reasons go to stderr.** The job log reads
 *    stdout; failure reasons belong in the log and the issue, not in a summary
 *    of an edition that was never published.
 * 3. **`--summary-json=<path>` writes the same run as data.** The scheduled job
 *    (Task 15) needs the numbers, not the prose, and scraping them back out of
 *    the human report with `grep` would make that report a parsing contract —
 *    reword a label and the job summary silently empties. The file is written
 *    outside the repository (the workflow points it at `$RUNNER_TEMP`), so it is
 *    never a candidate for the commit.
 */

import { writeFile } from 'node:fs/promises'

import { CONTENT_DIR, IMAGE_DIR } from '../lib/ingest/config'
import { defaultGenerator } from '../lib/ingest/curate'
import { httpFetcher } from '../lib/ingest/fetch'
import { httpHtmlFetcher, httpImageFetcher } from '../lib/ingest/images'
import { runIngest } from '../lib/ingest/run'
import type { IngestResult } from '../lib/ingest/run'

const USAGE = 'Usage: pnpm ingest [--force] [--dry-run] [--summary-json=<path>]'

const SUMMARY_FLAG = '--summary-json='

type Args = { force: boolean; dryRun: boolean; summaryJson: string | null }

/**
 * Parse argv, refusing anything unrecognized.
 *
 * The refusal matters more than the parsing. A silently ignored `--dryrun` would
 * run the real thing: a model call spent and an edition written, by someone who
 * typed a flag meaning "write nothing". Unknown flags exit 2 — distinct from the
 * 1 a failed run uses, so a wrapper can tell a bad invocation from a bad day.
 */
function parseArgs(argv: readonly string[]): Args {
  const args: Args = { force: false, dryRun: false, summaryJson: null }

  for (const arg of argv) {
    if (arg === '--force') args.force = true
    else if (arg === '--dry-run') args.dryRun = true
    else if (arg.startsWith(SUMMARY_FLAG)) {
      // `--summary-json=<path>`, one token, so the loop stays a loop. A separate
      // value token would need lookahead and a "flag at the end of argv" case,
      // for no gain at a call site that is always written by a workflow file.
      const path = arg.slice(SUMMARY_FLAG.length)
      if (path === '') {
        process.stderr.write(`${SUMMARY_FLAG}<path> needs a path.\n${USAGE}\n`)
        process.exit(2)
      }
      args.summaryJson = path
    } else {
      process.stderr.write(`Unrecognized argument: ${arg}\n${USAGE}\n`)
      process.exit(2)
    }
  }

  return args
}

function line(text = ''): void {
  process.stdout.write(`${text}\n`)
}

/**
 * Print what the run did, in the order someone reading a job log wants it:
 * what it covered, what it had to work with, what it chose, where it went.
 *
 * Printed for every outcome, including the failures. A run that aborted still
 * collected and selected, and the candidate count and the failure list are the
 * first things worth seeing when asking why it aborted.
 */
function report(result: IngestResult, args: Args): void {
  line(`Edition date      ${result.date}`)
  line(`Candidates        ${result.candidateCount}`)
  line(`Unparseable dates ${result.unparseable}`)
  line(
    `Source failures   ${result.failures.length === 0 ? 'none' : `${result.failures.length} (${result.failures.join(', ')})`}`,
  )

  const edition = result.edition

  if (edition) {
    line()
    line(`Chosen            ${edition.items.length} of at most ${edition.targetCount}`)
    for (const item of edition.items) {
      line(`  ${String(item.rank).padStart(2)}. ${item.title}`)
      line(`      ${item.source.name}${item.image ? '' : ' · no image'}`)
    }
    line()
    line(`Summary           ${edition.summary}`)
  }

  line()

  if (result.wrote && result.path) line(`Wrote             ${result.path}`)
  else if (args.dryRun) line('Wrote             nothing (dry run)')
  else line('Wrote             nothing')

  // Every reason, never the first one only. Validation accumulates them
  // precisely so a failed run says everything that was wrong in one pass instead
  // of one thing per re-run.
  if (result.reasons.length > 0) {
    const label = result.code === 0 ? 'Note' : 'Failed'
    process.stderr.write('\n')
    for (const reason of result.reasons) process.stderr.write(`${label}: ${reason}\n`)
  }
}

/**
 * The same run, as data.
 *
 * Deliberately flat and deliberately not the whole `Edition`: a consumer wants
 * the numbers and the path, and embedding twenty items would make the file large
 * enough that somebody would be tempted to render it. `chosen` is null when the
 * run aborted before assembling anything, which is not the same fact as zero.
 */
type RunSummary = {
  code: number
  wrote: boolean
  dryRun: boolean
  forced: boolean
  date: string
  candidateCount: number
  unparseable: number
  failures: string[]
  chosen: number | null
  targetCount: number | null
  summary: string | null
  path: string | null
  reasons: string[]
}

function toSummary(result: IngestResult, args: Args): RunSummary {
  return {
    code: result.code,
    wrote: result.wrote,
    dryRun: args.dryRun,
    forced: args.force,
    date: result.date,
    candidateCount: result.candidateCount,
    unparseable: result.unparseable,
    failures: result.failures,
    chosen: result.edition ? result.edition.items.length : null,
    targetCount: result.edition ? result.edition.targetCount : null,
    summary: result.edition ? result.edition.summary : null,
    path: result.path,
    reasons: result.reasons,
  }
}

/**
 * Write the summary file, and never let failing to write it change the run.
 *
 * An unwritable path is a problem with the caller's plumbing, not with the
 * edition. Turning it into a non-zero exit would fail a job that had just
 * published a perfectly good day — and, worse, would do so *after* the write,
 * which is the one shape of failure this pipeline is built never to have.
 */
async function writeSummary(path: string, summary: RunSummary): Promise<void> {
  try {
    await writeFile(path, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  } catch (error) {
    process.stderr.write(
      `Could not write the run summary to ${path}: ${
        error instanceof Error ? error.message : String(error)
      }\nThe run itself is unaffected; its exit code stands.\n`,
    )
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  // Fail here rather than after eleven feeds have been fetched. Curation is not
  // optional on any path — `--dry-run` still calls the model, it just writes
  // nothing — so a missing key can only ever end in the same abort, and the
  // honest version of that abort is the one that happens in the first
  // millisecond with a sentence saying what to do about it.
  if (!process.env.ANTHROPIC_API_KEY) {
    process.stderr.write(
      'ANTHROPIC_API_KEY is not set.\n' +
        'The run curates on every path, including --dry-run, so there is no mode that can skip it.\n' +
        'Set the key in the environment and try again:\n' +
        '  ANTHROPIC_API_KEY=sk-ant-... pnpm ingest' +
        (args.dryRun ? ' --dry-run' : '') +
        '\n',
    )
    process.exit(1)
  }

  // `CONTENT_DIR` and `IMAGE_DIR` are repo-relative and resolve against the
  // working directory. `pnpm ingest` always runs from the package root, and so
  // does the scheduled job, so this is the same pair of directories every time.
  const result = await runIngest(
    {
      fetcher: httpFetcher,
      generate: defaultGenerator,
      fetchHtml: httpHtmlFetcher,
      fetchImage: httpImageFetcher,
      now: () => new Date(),
      contentDir: CONTENT_DIR,
      imageDir: IMAGE_DIR,
    },
    { force: args.force, dryRun: args.dryRun },
  )

  report(result, args)

  if (args.summaryJson) await writeSummary(args.summaryJson, toSummary(result, args))

  // Set rather than `process.exit`, so buffered stdout is flushed before the
  // process ends. `runIngest` never throws, so this is the only exit status the
  // script produces on a completed run.
  process.exitCode = result.code
}

main().catch((error: unknown) => {
  // Unreachable by design — `runIngest` turns every failure into a reason and a
  // code. If it ever fires, the bug is upstream of here and the message should
  // say so rather than presenting a stack trace as the day's news.
  process.stderr.write(
    `The ingest script failed outside the pipeline, which should not be possible: ${
      error instanceof Error ? error.stack ?? error.message : String(error)
    }\n`,
  )
  process.exitCode = 1
})
