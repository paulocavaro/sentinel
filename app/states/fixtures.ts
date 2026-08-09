// The data behind the catalogue.
//
// Five of the eight frames on `/states` need an edition, and the archive holds
// two: a complete twenty-item day and a complete thirty-item day, contiguous,
// every item photographed. None of the four conditions the catalogue has to
// show is in there as it stands — there is no thin edition, no gap in the
// dates, and no item without a picture.
//
// So the fixtures are **derived, never invented**. Every word of copy on that
// page is a sentence a model actually wrote for a committed edition; what a
// fixture does is *remove* — items, a photograph — or *relabel* — the date, the
// dates around it — or *quote*, which is what state 07's answer is: two real
// descriptions, verbatim, each under the outlet that published it and linking at
// the article, exactly as the panel prints one. A hand-written
// seventeen-item edition would put copy on the states page that no pipeline
// ever produced, and the state it demonstrates would stop being a state of this
// product and start being a mock of one.
// `design-refs/build-states.mjs` derives its frames from the same two files in
// the same way, which is what lets the two be compared at all.
//
// **A missing edition throws.** Both files are committed and the catalogue is
// pinned to them by name, so their absence is a broken checkout rather than a
// state to render — the same way the reference's generator simply crashes.
// This is deliberately not `app/page.tsx`'s empty-archive branch: that one is
// about a repository before its first ingest, which has no dates at all.

import { dayMonth, shiftDays } from '@/lib/date'
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

/**
 * State 08's day, and the two editions either side of it.
 *
 * A different day from state 03's, and deliberately: the two frames are the same
 * component and the same markup, and the only thing that separates them is what
 * the page says. On one date they would read as one frame drawn twice, and the
 * sentence that is the entire subject of 08 would look like a variant of 03's
 * rather than a correction of it.
 *
 * The archive holds nothing like this either — an unreadable edition is a file
 * that failed validation, and the two committed files are both fine. Writing a
 * damaged one to demonstrate it would put a broken edition in the repository to
 * make a page look right, so the frame is told which state it is instead, the
 * same way the route tells it.
 */
const UNREADABLE_DATE = '2026-08-05'
const UNREADABLE_ARCHIVE = ['2026-08-04', '2026-08-06'] as const

/** The two items state 04 frames — `build-states.mjs`'s `ed.items[3]` and `ed.items[1]`. */
const WITH_PHOTO = 3
const WITHOUT_PHOTO = 1

/**
 * The two items state 05's answer rests on, in the order it names them.
 *
 * That frame's two sentences are the one piece of copy on this page that no
 * pipeline wrote — they predate the search existing, and they stay written until
 * the frame is redrawn. What they are *about* is not invented, though: both were
 * paraphrased off the 9 August edition, sentence one from item 0 and sentence
 * two from item 18, and those are the two items cited here. A citation is a
 * promise that the claim beside it can be checked, so the one thing it may never
 * be is decorative — pointing these at a plausible-looking article rather than
 * at the story the sentence was written from would put the exact failure this
 * frame exists to rule out into the frame that rules it out.
 */
const ANSWERED_ITEMS = [0, 18] as const

/**
 * The two items state 07's earlier answer rests on, in the order it names them.
 *
 * The same indices `build-states.mjs` reads, out of the same file. The two
 * questions in that frame are the product's own voice and are written into the
 * page; the answer is not, and could not be. An answer is a claim about what
 * the archive holds, so a sentence composed for the catalogue would be the one
 * place on this site where the panel is shown quoting something no edition ever
 * carried — in the frame whose whole subject is a series of answers being
 * trustworthy one after another.
 */
const FOLLOW_UP_ITEMS = [3, 8] as const

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

/** State 08 — a day whose file is on disk and could not be read as an edition. */
export const unreadableFixture: { date: string; dates: readonly string[] } = {
  date: UNREADABLE_DATE,
  dates: UNREADABLE_ARCHIVE,
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

/**
 * One citation, as the panel prints it: the outlet, the day, and the article it
 * goes to.
 *
 * Three fields off the item and nothing composed. The panel used to print the
 * day alone and link at the edition, which named a date the reader could read
 * and a page they then had to search; naming the outlet and going to the article
 * is what makes the citation checkable. `AskPanel` resolves the same three out
 * of the search results, and here they come off the item directly because the
 * catalogue has the item in its hand.
 */
export type Cite = { id: string; publisher: string; url: string; day: string }

/** One sentence of an answer, and the item it rests on. */
export type AnsweredSentence = Cite & { text: string }

/**
 * The nth item of an edition, or a broken checkout said plainly.
 *
 * The indices are pinned to two committed files, so an index past the end is a
 * repository that is not the one this page was written against — not a state to
 * render, and nothing to fall back to.
 */
function nth(edition: Edition, n: number): EditionItem {
  const item = edition.items[n]

  if (item === undefined) {
    throw new Error(
      `/states quotes item ${n} of content/days/${edition.date}.json, which holds ` +
        `${edition.items.length}.`,
    )
  }

  return item
}

/** The item's own citation. Nothing here is derived from anything but the item. */
function cite(item: EditionItem, day: string): Cite {
  return { id: item.id, publisher: item.publisher, url: item.url, day }
}

/**
 * State 05 — the two citations under the answered frame.
 *
 * The sentences themselves are written into the page; these are the items they
 * were written from. See `ANSWERED_ITEMS` for why that pairing is not a detail.
 */
export async function answeredFixture(): Promise<{ astra: Cite; nextSlide: Cite }> {
  const edition = await source(SAMPLE_DATE)
  const day = dayMonth(edition.date)
  const [astra, nextSlide] = ANSWERED_ITEMS

  return { astra: cite(nth(edition, astra), day), nextSlide: cite(nth(edition, nextSlide), day) }
}

/**
 * State 07 — the answer the reader has already been given, before they ask
 * again.
 *
 * A sentence and the item under it, which is the whole shape of an answer here:
 * the panel may not say anything it cannot hang on an item, and the citation is
 * the item saying it. Both sentences come out of the same edition, so both days
 * are the same day — which is the ordinary case and not a simplification, and it
 * is also the case the panel used to collapse into one citation. The two items
 * are two sources, so the frame prints two. The date is formatted through
 * `lib/date`, not written, so this frame prints the day the same way every other
 * surface on the site prints it.
 */
export async function followUpFixture(): Promise<AnsweredSentence[]> {
  const edition = await source(SAMPLE_DATE)
  const day = dayMonth(edition.date)

  return FOLLOW_UP_ITEMS.map((n) => {
    const item = nth(edition, n)

    return { ...cite(item, day), text: item.description }
  })
}
