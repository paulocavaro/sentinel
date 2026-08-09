// The data behind the catalogue.
//
// Four of the six frames on `/states` need an edition, and the archive holds
// two: a complete twenty-item day and a complete thirty-item day, contiguous,
// every item photographed. None of the four conditions the catalogue has to
// show is in there as it stands — there is no thin edition, no gap in the
// dates, and no item without a picture.
//
// So the fixtures are **derived, never invented**. Every word of copy on that
// page is a sentence a model actually wrote for a committed edition; what a
// fixture does is *remove* — items, a photograph — or *relabel* — the date, the
// dates around it. A hand-written seventeen-item edition would put copy on the
// states page that no pipeline ever produced, and the state it demonstrates
// would stop being a state of this product and start being a mock of one.
// `design-refs/build-states.mjs` derives its frames from the same two files in
// the same way, which is what lets the two be compared at all.
//
// **A missing edition throws.** Both files are committed and the catalogue is
// pinned to them by name, so their absence is a broken checkout rather than a
// state to render — the same way the reference's generator simply crashes.
// This is deliberately not `app/page.tsx`'s empty-archive branch: that one is
// about a repository before its first ingest, which has no dates at all.

import { shiftDays } from '@/lib/date'
import { readEdition } from '@/lib/edition'
import type { Edition, EditionItem } from '@/lib/edition'

/** The edition state 01 leaves live: complete, twenty items, `targetCount: 20`. */
const STALE_DATE = '2026-08-08'

/** The day it is stale on. The next run is the morning after that. */
const STALE_TODAY = '2026-08-09'

/** The edition states 02 and 04 are derived from: complete, thirty items. */
const SAMPLE_DATE = '2026-08-09'

/** State 02's date, and how much of the sample edition survives to it. */
const THIN_DATE = '2026-08-11'
const THIN_COUNT = 17

/**
 * State 03's day, and the two editions either side of it.
 *
 * The archive's own dates cannot show this state: 8 and 9 August are adjacent,
 * so no date between them is missing, and `neighbours()` on a date outside the
 * range would offer one direction only. These two stand in for an archive with
 * a hole in it, which is the shape the pipeline produces the first time a run
 * fails — and the component finds its own neighbours in them, so what the frame
 * shows is `EditionBar.neighbours` working, not a pair of hand-written links.
 */
const MISSING_DATE = '2026-08-03'
const MISSING_ARCHIVE = ['2026-08-02', '2026-08-04'] as const

/** The two items state 04 frames — `build-states.mjs`'s `ed.items[3]` and `ed.items[1]`. */
const WITH_PHOTO = 3
const WITHOUT_PHOTO = 1

async function source(date: string): Promise<Edition> {
  const edition = await readEdition(date)

  if (edition === null) {
    throw new Error(
      `/states is pinned to content/days/${date}.json, which is committed to this ` +
        `repository and was not readable. The catalogue's fixtures are derived from ` +
        `real editions; there is nothing to fall back to.`,
    )
  }

  return edition
}

/**
 * State 01 — yesterday's edition, still live.
 *
 * Nothing is derived here at all: this is the 8 August edition exactly as it
 * was published. The state is not a property of the edition but of the day it
 * is being read on, which is why `StaleBanner` takes both dates as props.
 */
export async function staleFixture(): Promise<{ edition: Edition; nextRun: string }> {
  return { edition: await source(STALE_DATE), nextRun: shiftDays(STALE_TODAY, 1) }
}

/**
 * State 02 — a thin day.
 *
 * Thirty items truncated to seventeen and relabelled to a Tuesday. `targetCount`
 * is deliberately left at thirty: that field is the ceiling the edition was
 * built against, and it is the whole of what `isThin` reads. Truncating the
 * items and lowering the target with them would produce a complete
 * seventeen-item edition — the 8 August case exactly, which is not thin — and
 * the frame would quietly show state 01's masthead a second time.
 */
export async function thinFixture(): Promise<Edition> {
  const edition = await source(SAMPLE_DATE)

  return { ...edition, date: THIN_DATE, items: edition.items.slice(0, THIN_COUNT) }
}

/** State 03 — a day the pipeline never wrote, and an archive with a hole in it. */
export const missingFixture: { date: string; dates: readonly string[] } = {
  date: MISSING_DATE,
  dates: MISSING_ARCHIVE,
}

/**
 * State 04 — a card with a photograph beside a card without one.
 *
 * The second item is a real item with its `image` set to null, which is the
 * same construction the reference makes and the honest one: about a third of
 * every day's items arrive this way, the field is nullable in the pipeline's
 * own type, and the alternative — the one item in the archive that happens to
 * have no picture — would tie the frame to whichever day that item was
 * published on.
 */
export async function photographFixture(): Promise<{
  withPhoto: EditionItem
  withoutPhoto: EditionItem
}> {
  const edition = await source(SAMPLE_DATE)
  const withPhoto = edition.items[WITH_PHOTO]
  const withoutPhoto = edition.items[WITHOUT_PHOTO]

  if (withPhoto === undefined || withoutPhoto === undefined) {
    throw new Error(
      `/states frames items ${WITH_PHOTO} and ${WITHOUT_PHOTO} of ` +
        `content/days/${SAMPLE_DATE}.json, which holds ${edition.items.length}.`,
    )
  }

  return { withPhoto, withoutPhoto: { ...withoutPhoto, image: null } }
}
