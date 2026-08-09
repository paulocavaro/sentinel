import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { edition, tempArchive } from '@/app/__fixtures__/archive'
import type { TempArchive } from '@/app/__fixtures__/archive'

// The chip row reads the address bar; nothing here is about filtering.
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useSearchParams: () => new URLSearchParams(),
}))

const { default: Home, generateMetadata } = await import('./page')

// The front page: the latest edition the pipeline published.
//
// **The latest, not "today's".** That one choice is what makes the stale state
// fall out of the data instead of needing a branch of its own, and it is the
// reason the clock below is frozen rather than mocked away: what this route
// does with today's date is most of what it does.

const html = renderToStaticMarkup

/** The day the newest fixture edition is published on. */
const TODAY = new Date('2026-08-09T12:00:00.000Z')

const ORIGINAL_TZ = process.env.TZ

/**
 * Assigning `undefined` to `process.env` stores the string "undefined", which
 * is not a timezone — an unset TZ has to be deleted instead. The same note is
 * on `lib/date.test.ts`, where it was learned.
 */
function restoreTZ() {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
}

let archive: TempArchive

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: TODAY })
  archive = await tempArchive()
})

afterEach(async () => {
  await archive.drop()
  vi.useRealTimers()
  restoreTZ()
})

describe('Home', () => {
  it('renders the newest edition, whichever order it was written in', async () => {
    await archive.put(edition('2026-08-09', 6, { themes: ['ai', 'world'] }))
    await archive.put(edition('2026-08-08', 4))

    const page = html(await Home())

    expect(page).toContain('<span class="weekday">Sunday</span> 9 August')
    // Six items, not the four of the day before it. 8 August is still on the
    // page — it is where the edition bar's prev link points — so the count is
    // what distinguishes which edition was actually rendered.
    expect(page).toContain('<p class="close-mark" aria-hidden="true">-6-</p>')
    expect(page).toContain('<a class="day" rel="prev" href="/day/2026-08-08">')
  })

  describe('the stale banner', () => {
    it('stays away while the newest edition is today’s', async () => {
      await archive.put(edition('2026-08-09', 6))

      expect(html(await Home())).not.toContain('stale-banner')
    })

    // The job failed, so nothing was written and yesterday's edition is still
    // live. The spec requires that be marked.
    it('appears once the newest edition is behind today', async () => {
      await archive.put(edition('2026-08-08', 4))

      const page = html(await Home())

      expect(page).toContain('You are reading Saturday 8 August.')
      expect(page).toContain('Today’s edition did not build.')
      expect(page).toContain('dateTime="2026-08-10T09:23Z"')
    })

    // Every other date in this codebase is UTC: editions are named after the UTC
    // day they cover. Comparing a UTC edition date against the build machine's
    // local date would call an edition stale for four hours a day, west of
    // Greenwich — and here, east of it, would call today's edition stale a day
    // early.
    it('reads today in UTC, not in the machine’s timezone', async () => {
      // 23:30 UTC on the 9th is already the 10th in Kiritimati, UTC+14. An
      // implementation reading the build machine's local date calls this
      // edition stale — a day early, every night, east of Greenwich.
      vi.setSystemTime(new Date('2026-08-09T23:30:00.000Z'))
      process.env.TZ = 'Pacific/Kiritimati'

      try {
        // Asserted rather than assumed, the same control `lib/date.test.ts`
        // keeps: if reassigning TZ mid-process stopped taking effect, this test
        // would pass by doing nothing at all.
        expect(new Date().getDate()).toBe(10)

        await archive.put(edition('2026-08-09', 6))

        expect(html(await Home())).not.toContain('stale-banner')
      } finally {
        restoreTZ()
      }
    })
  })

  // Not `NoEdition`: that state is an archive date the pipeline never wrote, and
  // it has a date in the masthead, calendar neighbours to offer and a link to the
  // latest edition. Here there is no date, no neighbour and no latest edition,
  // so reusing the component would mean giving all four a second, empty mode.
  describe('an empty archive', () => {
    it('says the first edition has not run', async () => {
      const page = html(await Home())

      expect(page).toContain('No editions yet')
      expect(page).toContain('The first one has not run yet.')
      expect(page).toContain('Nothing published')
    })

    it('offers no edition bar, because there is nothing to step to', async () => {
      expect(html(await Home())).not.toContain('editionbar')
    })
  })
})

describe('generateMetadata', () => {
  // Written out with `absolute` rather than left to the layout: `title.template`
  // applies to *child* segments and not to the segment it is declared in, so a
  // bare title here would make the front page the one page whose tab does not
  // say Sentinel.
  it('titles the page with the edition’s date and the wordmark', async () => {
    await archive.put(edition('2026-08-09', 6))

    expect(await generateMetadata()).toEqual({
      title: { absolute: 'Sunday 9 August — Sentinel' },
    })
  })

  it('leaves the layout’s default standing when nothing is published', async () => {
    expect(await generateMetadata()).toEqual({})
  })
})
