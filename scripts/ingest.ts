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
 * 2. **The summary goes to stdout, the reasons go to stderr.** The job step pipes
 *    stdout into `$GITHUB_STEP_SUMMARY` (Task 15); failure reasons belong in the
 *    log and the issue, not in a summary of an edition that was never published.
 */

import { CONTENT_DIR, IMAGE_DIR } from '../lib/ingest/config'
import { defaultGenerator } from '../lib/ingest/curate'
import { httpFetcher } from '../lib/ingest/fetch'
import { httpHtmlFetcher, httpImageFetcher } from '../lib/ingest/images'
import { runIngest } from '../lib/ingest/run'
import type { IngestResult } from '../lib/ingest/run'

const USAGE = 'Usage: pnpm ingest [--force] [--dry-run]'

type Args = { force: boolean; dryRun: boolean }

/**
 * Parse argv, refusing anything unrecognized.
 *
 * The refusal matters more than the parsing. A silently ignored `--dryrun` would
 * run the real thing: a model call spent and an edition written, by someone who
 * typed a flag meaning "write nothing". Unknown flags exit 2 — distinct from the
 * 1 a failed run uses, so a wrapper can tell a bad invocation from a bad day.
 */
function parseArgs(argv: readonly string[]): Args {
  const args: Args = { force: false, dryRun: false }

  for (const arg of argv) {
    if (arg === '--force') args.force = true
    else if (arg === '--dry-run') args.dryRun = true
    else {
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
