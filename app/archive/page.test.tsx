import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { edition, tempArchive } from '@/app/__fixtures__/archive'
import type { TempArchive } from '@/app/__fixtures__/archive'

import Archive from './page'

// The index of everything published, grouped by month.
//
// This is the one screen in the phase with no design reference, so the visual
// gate never sees it. These are the whole of its automated verification.

const html = renderToStaticMarkup

/**
 * The clock is frozen, because `dayMonth` prints the year only for a date
 * outside the current one — the masthead's range reads "3 August – 9 August"
 * this year and "3 August 2026 – 9 August 2026" next year. A test written
 * against fixed dates and a live clock passes until New Year's Day and then
 * fails for a reason that has nothing to do with the archive. Only `Date` is
 * faked; the fixtures write real files.
 */
const NOW = new Date('2026-08-09T12:00:00.000Z')

let archive: TempArchive

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW })
  archive = await tempArchive()
})

afterEach(async () => {
  await archive.drop()
  vi.useRealTimers()
})

/** Write one trivial edition per date, in whatever order they are given. */
async function publish(...dates: string[]): Promise<void> {
  for (const date of dates) await archive.put(edition(date, 3))
}

describe('Archive', () => {
  describe('an empty archive', () => {
    // A fresh clone, and this repository between its first commit and its first
    // successful ingest. The same sentence `/` says, because it is the same
    // fact — and the masthead is the only part of this page with anything to
    // render.
    it('says the first edition has not run, and lists nothing', async () => {
      const page = html(await Archive())

      expect(page).toContain('No editions yet')
      expect(page).toContain('The first one has not run yet.')
      expect(page).toContain('Nothing published')
      expect(page).not.toContain('<main>')
    })
  })

  describe('grouping', () => {
    it('opens one section per month, newest first', async () => {
      await publish('2026-07-30', '2026-08-03', '2026-08-09')

      const page = html(await Archive())

      expect(page).toContain('<h2 class="section-name" id="2026-08-name">August 2026</h2>')
      expect(page).toContain('<h2 class="section-name" id="2026-07-name">July 2026</h2>')
      expect(page.indexOf('2026-08-name')).toBeLessThan(page.indexOf('2026-07-name'))
    })

    it('runs the dates inside a month newest first too', async () => {
      await publish('2026-08-03', '2026-08-09')

      const page = html(await Archive())

      expect(page.indexOf('/day/2026-08-09')).toBeLessThan(page.indexOf('/day/2026-08-03'))
    })

    // The key is the `YYYY-MM` prefix and not the printed label. Grouping on the
    // label would work by accident for a year and then merge two Augusts.
    it('does not merge the same month of two different years', async () => {
      await publish('2025-08-08', '2026-08-08')

      const page = html(await Archive())

      expect(page).toContain('id="2026-08-name">August 2026<')
      expect(page).toContain('id="2025-08-name">August 2025<')
    })

    it('keeps every date it was given', async () => {
      await publish('2026-06-01', '2026-07-15', '2026-08-09')

      const page = html(await Archive())

      for (const date of ['2026-06-01', '2026-07-15', '2026-08-09']) {
        expect(page).toContain(`href="/day/${date}"`)
      }
    })
  })

  describe('the masthead', () => {
    it('counts the editions and names the span they cover', async () => {
      await publish('2026-08-03', '2026-08-09')

      expect(html(await Archive())).toContain(
        '<p class="promise">2 editions · 3 August – 9 August</p>',
      )
    })

    it('says "1 edition" for an archive of one', async () => {
      await publish('2026-08-09')

      expect(html(await Archive())).toContain('1 edition · 9 August – 9 August')
    })

    // A date outside the current year carries it. Left to a live clock this
    // page changes shape on New Year's Day, in the masthead and in every link
    // under every month, which is why the reference generator's own copy of the
    // rule is worth keeping in step.
    it('prints the year once the archive is older than the year', async () => {
      vi.setSystemTime(new Date('2027-01-05T12:00:00.000Z'))
      await publish('2026-08-09')

      const page = html(await Archive())

      expect(page).toContain('1 edition · 9 August 2026 – 9 August 2026')
      expect(page).toContain('>9 August 2026</a>')
    })
  })

  // It does not list the gap days, even though `/day/[date]` renders a page for
  // each of them: this is the index of what Sentinel published, and a link to a
  // day that ran nothing is a footnote rather than an entry.
  it('lists only the days that published', async () => {
    await publish('2026-08-08', '2026-08-11')

    const page = html(await Archive())

    expect(page).not.toContain('/day/2026-08-09')
    expect(page).not.toContain('/day/2026-08-10')
  })

  // The fab's label is "Ask this archive", and this is the archive. No other
  // secondary page carries it.
  it('carries the ask button', async () => {
    await publish('2026-08-09')

    expect(html(await Archive())).toContain('Ask this archive')
  })
})
