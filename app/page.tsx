// The front page: the latest edition the pipeline published.
//
// **The latest, not "today's".** That one choice is what makes the stale state
// fall out of the data instead of needing a branch of its own: the newest file
// is rendered, its date is compared to today's, and when they differ the banner
// appears. A route that asked for today's edition by name would have to handle
// "there isn't one" separately, and would then be showing nothing on the exact
// morning the reader most needs to be told why.
//
// Everything below the two reads is `EditionPage`, which `/day/[date]` renders
// as well. Nothing about the front page's layout lives here.

import type { Metadata } from 'next'

import { EditionPage } from '@/app/components/EditionPage'
import { editionDate } from '@/lib/date'
import { listEditionDates, readLatestEdition } from '@/lib/edition'
import { CLOSING_TIME } from '@/lib/ingest/config'

/**
 * Today, as a UTC calendar date.
 *
 * UTC because every other date in this codebase is: editions are named after
 * the UTC day they cover, and `lib/date.ts` formats them with an explicit
 * `timeZone: 'UTC'` so a page prerendered anywhere says the same day to
 * everyone. Comparing a UTC edition date against the build machine's local date
 * would call an edition stale for four hours a day, west of Greenwich.
 *
 * Read at build time, and there is no honest way around that on a prerendered
 * route — see `EditionPage`'s `today` and Task 11.
 */
function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * The title is the edition's date.
 *
 * **Written out in full, with `absolute`, rather than left to the layout's
 * template.** `title.template` applies to *child* route segments and not to the
 * segment it is declared in — `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md`
 * says so in as many words — and `app/page.tsx` is the root layout's own
 * segment. A bare `title: '…'` here is emitted verbatim, so the front page
 * would be the one page on the site whose tab does not say Sentinel, while
 * `/day/2026-08-08` — a real child segment — would be templated normally. The
 * suffix is spelled out so the two routes read the same in a tab strip.
 *
 * Both readers are `React.cache`-wrapped, so this call and the page's call
 * below read `content/days` once between them rather than twice.
 */
export async function generateMetadata(): Promise<Metadata> {
  const edition = await readLatestEdition()

  // Nothing published: no title at all, so the layout's `default` — "Sentinel"
  // — stands on its own.
  return edition === null
    ? {}
    : { title: { absolute: `${editionDate(edition.date)} — Sentinel` } }
}

export default async function Home() {
  const [edition, dates] = await Promise.all([readLatestEdition(), listEditionDates()])

  // An empty archive, which is a fresh clone and this repository between its
  // first commit and its first successful ingest.
  //
  // **This is not `NoEdition`.** That state — `states.html` 03, Task 10 — is an
  // archive date the pipeline never wrote: it has a date in the masthead, a
  // sentence naming that date, calendar neighbours to offer and a link to the
  // latest edition. Here there is no date, no neighbour and no latest edition to
  // link to, so reusing the component would mean giving all four of them a
  // second, empty mode to serve a page that shares only the masthead with it.
  // Two small honest states, rather than one component that is neither.
  if (edition === null) {
    return (
      <div className="page">
        <header className="masthead">
          <p className="wordmark">Sentinel</p>
          <h1 className="editiondate">No editions yet</h1>
          <p className="promise">Nothing published</p>
        </header>

        {/* The sentence is the whole of this page's content, and it is a
            `<main class="wayout">` for that reason — the same split every page
            here that is not an edition makes, and the only one where the main
            holds no link, because with nothing published there is nowhere to
            offer. See `NoEdition`, and `.wayout` for why it costs no pixels. */}
        <main className="wayout" id="results">
          {/* Upright, like `not-found.tsx` and `states.html` 03: `.manifest` is
              italic because it usually carries the model's editorial line, and
              this sentence is the product speaking. */}
          <p className="manifest" style={{ fontStyle: 'normal' }}>
            {`Sentinel publishes one edition a morning, closed at ${CLOSING_TIME}. The first one has not run yet.`}
          </p>
        </main>
      </div>
    )
  }

  return <EditionPage edition={edition} dates={dates} today={todayUTC()} />
}
