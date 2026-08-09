// Yesterday's edition, still live — design-refs/states.html state 01.
//
// The job failed, so nothing was written and the previous day stays up. The
// spec requires that be marked, and this is the one place the accent is spent
// on something other than the rank and the end mark, because it is the only
// genuine emergency the product has.
//
// **It does not decide whether it should exist.** Deciding means comparing the
// edition's date to today, and on a prerendered route `today` is frozen at
// build time — which is the whole subject of Task 11: nothing rebuilds the site
// unless the ingest succeeds, so in the exact scenario this banner exists for
// the page still believes it was built today. A `new Date()` inside this
// component would hide that: it would read the build machine's clock, look
// correct in `pnpm dev`, and be permanently false in production. So both dates
// arrive as props, from a caller that knows which day it is asking about.

import { editionDate } from '@/lib/date'
import type { Edition } from '@/lib/edition'
import { CLOSING_TIME } from '@/lib/ingest/config'

/**
 * @param edition  the edition on screen — the stale one, not the missing one.
 * @param nextRun  the calendar date of the next scheduled run. The banner is
 *   only reachable after the day's run has already failed, so the next one is
 *   always tomorrow, and "tomorrow" is what the reader is told. The date itself
 *   goes into `datetime`, where it is unambiguous without a reference point:
 *   the word is relative to the reader's day and the attribute is not.
 */
export function StaleBanner({ edition, nextRun }: { edition: Edition; nextRun: string }) {
  return (
    <div className="stale-banner">
      <p className="stale-what">{`You are reading ${editionDate(edition.date)}.`}</p>
      <p className="stale-why">
        {'Today’s edition did not build. The next run is '}
        <time dateTime={`${nextRun}T${CLOSING_TIME}`}>{`${CLOSING_TIME} tomorrow`}</time>.
      </p>
    </div>
  )
}
