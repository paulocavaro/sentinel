import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { edition, tempArchive } from '@/app/__fixtures__/archive'
import type { TempArchive } from '@/app/__fixtures__/archive'

// The chip row reads the address bar; nothing here is about filtering.
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useSearchParams: () => new URLSearchParams(),
}))

const { default: Day, dynamicParams, generateMetadata, generateStaticParams } = await import(
  './page'
)

// One day of the archive, by name.
//
// The route's two private rules are the whole subject: which URLs exist at all
// (`generateStaticParams`, which walks the archive's span rather than listing
// its editions) and what counts as a calendar date (which the shape test alone
// gets wrong — `2026-02-30` matches the regex and is not a day).

const html = renderToStaticMarkup

/**
 * Frozen, because `editionDate` prints the year only for a date outside the
 * current one: the title of 9 August 2026 is "Sunday 9 August" this year and
 * "Sunday 9 August 2026" next year. Only `Date` is faked; the fixtures write
 * real files.
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

/**
 * What Next hands a page in 16: both bags are Promises, and `PageProps` — the
 * generated type this route is written against — requires `searchParams` even
 * on a route that never reads it.
 */
const params = (date: string): PageProps<'/day/[date]'> => ({
  params: Promise.resolve({ date }),
  searchParams: Promise.resolve({}),
})

describe('generateStaticParams', () => {
  // The set of URLs under /day/ is the set of days the product has existed — a
  // fact about the archive rather than a rule about strings. The gap days are
  // pages too: a real day the pipeline never wrote has to render `NoEdition`,
  // and with `dynamicParams` false the only way to reach it is to build it.
  it('generates every day the archive spans, gaps included', async () => {
    await archive.put(edition('2026-08-08', 3))
    await archive.put(edition('2026-08-11', 3))

    expect(await generateStaticParams()).toEqual([
      { date: '2026-08-08' },
      { date: '2026-08-09' },
      { date: '2026-08-10' },
      { date: '2026-08-11' },
    ])
  })

  it('generates the one day of a one-day archive', async () => {
    await archive.put(edition('2026-08-09', 3))

    expect(await generateStaticParams()).toEqual([{ date: '2026-08-09' }])
  })

  it('generates nothing from an empty archive', async () => {
    expect(await generateStaticParams()).toEqual([])
  })

  // Walked with `shiftDays`, which does the arithmetic in UTC. Adding 86_400_000
  // to a timestamp drifts a day per year of archive, and the drift starts at a
  // month boundary — which is what this crosses.
  it('walks across a month boundary without dropping or repeating a day', async () => {
    await archive.put(edition('2026-07-30', 3))
    await archive.put(edition('2026-08-02', 3))

    expect(await generateStaticParams()).toEqual([
      { date: '2026-07-30' },
      { date: '2026-07-31' },
      { date: '2026-08-01' },
      { date: '2026-08-02' },
    ])
  })

  it('walks across a year boundary', async () => {
    await archive.put(edition('2026-12-30', 3))
    await archive.put(edition('2027-01-02', 3))

    expect(await generateStaticParams()).toEqual([
      { date: '2026-12-30' },
      { date: '2026-12-31' },
      { date: '2027-01-01' },
      { date: '2027-01-02' },
    ])
  })

  // Everything else 404s before any code in this file runs. That is the reason
  // `/day/banana`, `/day/2026-02-30` and an unbounded tail of crawler noise are
  // not function invocations on a static dated record.
  it('is the whole of what the route answers to', () => {
    expect(dynamicParams).toBe(false)
  })
})

describe('generateMetadata', () => {
  it('titles a published day with its date', async () => {
    await archive.put(edition('2026-08-09', 3))

    expect(await generateMetadata(params('2026-08-09'))).toEqual({ title: 'Sunday 9 August' })
  })

  it('says so for a day that published nothing', async () => {
    await archive.put(edition('2026-08-09', 3))

    expect(await generateMetadata(params('2026-08-07'))).toEqual({
      title: 'No edition, Friday 7 August',
    })
  })

  // A bookmark, a search result and a history entry all outlive the render, so
  // "No edition" on a day the archive is holding is the same lie the masthead
  // used to tell, in a place that keeps it longer.
  it('does not call a day that published something a day with no edition', async () => {
    await archive.putRaw('2026-08-07', '{ not an edition')

    expect(await generateMetadata(params('2026-08-07'))).toEqual({
      title: 'Unreadable edition, Friday 7 August',
    })
  })

  // The shape test alone accepts these; the round trip through UTC is what
  // rejects them, whether the engine returns an invalid Date or rolls the
  // overflow forward into March.
  it.each([
    ['a day that is not on the calendar', '2026-02-30'],
    ['a month that is not on the calendar', '2026-13-01'],
    ['a leap day in a common year', '2026-02-29'],
    ['a word', 'banana'],
    ['an unpadded date', '2026-8-9'],
    ['a path', '../../etc/passwd'],
  ])('has nothing to say about %s', async (_, date) => {
    expect(await generateMetadata(params(date))).toEqual({})
  })

  it('accepts a real leap day', async () => {
    expect(await generateMetadata(params('2024-02-29'))).toEqual({
      title: 'No edition, Thursday 29 February 2024',
    })
  })
})

describe('Day', () => {
  it('renders the edition it was asked for', async () => {
    await archive.put(edition('2026-08-09', 6, { themes: ['ai', 'world'] }))

    const page = html(await Day(params('2026-08-09')))

    expect(page).toContain('9 August')
    expect(page).toContain('class="item lead"')
  })

  // Not `notFound()`: a day inside the archive's span that published nothing is
  // a fact about the product, and the page says which day it was and offers the
  // editions either side of it.
  it('renders NoEdition for a day inside the span that published nothing', async () => {
    await archive.put(edition('2026-08-08', 3))
    await archive.put(edition('2026-08-11', 3))

    const page = html(await Day(params('2026-08-10')))

    expect(page).toContain('No edition')
    expect(page).toContain('href="/day/2026-08-08"')
    expect(page).toContain('href="/day/2026-08-11"')
  })

  // The masthead says which day and what happened; everything that answers
  // *and now what* — the sentence and the three links — is the main. The whole
  // page used to be the header, which told a landmark reader this route has no
  // content and left the layout's skip link pointing at nothing.
  it('gives the no-edition page a main to skip to', async () => {
    await archive.put(edition('2026-08-08', 3))
    await archive.put(edition('2026-08-11', 3))

    const page = html(await Day(params('2026-08-10')))

    expect(page).toContain('<main class="wayout" id="results">')
    expect(page.indexOf('</header>')).toBeLessThan(page.indexOf('<main'))
    expect(page.indexOf('<main')).toBeLessThan(page.indexOf('class="editionbar"'))
  })

  // The regression, end to end and at the size it actually arrives: thirty
  // items on disk, one of them damaged by a merge conflict or by a field that
  // changed shape, the whole file refused under the reader's whole-file-or-
  // nothing rule. The page it produces must not tell the reader nothing ran —
  // there is a record for that day and the archive is holding it.
  it('says the day’s record could not be read, not that nothing ran', async () => {
    await archive.put(edition('2026-08-08', 3))
    await archive.put(edition('2026-08-11', 3))

    const damaged = edition('2026-08-10', 30)
    await archive.putRaw(
      '2026-08-10',
      JSON.stringify({
        ...damaged,
        items: damaged.items.map((entry, n) => (n === 17 ? { ...entry, title: null } : entry)),
      }),
    )

    const page = html(await Day(params('2026-08-10')))

    expect(page).toContain('Unreadable edition')
    expect(page).toContain('There is a file for 10 August, and it could not be read.')
    expect(page).not.toContain('Nothing ran')
    expect(page).not.toContain('No edition')
  })

  // The two states are one component and it must keep both sentences: a day
  // with no file is still a day that never ran, and the damaged-file copy would
  // be a guess about it.
  it('still says nothing ran for a day with no file at all', async () => {
    await archive.put(edition('2026-08-08', 3))
    await archive.put(edition('2026-08-11', 3))

    const page = html(await Day(params('2026-08-10')))

    expect(page).toContain('Nothing ran on 10 August')
    expect(page).not.toContain('could not be read')
  })

  // An archive day asked for by name is never stale, it is simply that day.
  it('never shows the stale banner', async () => {
    await archive.put(edition('2026-08-09', 3))

    expect(html(await Day(params('2026-08-09')))).not.toContain('stale-banner')
  })

  // Unreachable while `dynamicParams` is false — the router has already rejected
  // it. Kept because the day someone flips that flag for an unrelated reason,
  // this is the difference between a 404 and an unbounded surface, and because
  // `date` reaches a path join two calls later.
  it('404s a date outside the archive’s span even so', async () => {
    await archive.put(edition('2026-08-09', 3))

    await expect(Day(params('2026-08-20'))).rejects.toThrow()
    await expect(Day(params('2026-02-30'))).rejects.toThrow()
  })
})
