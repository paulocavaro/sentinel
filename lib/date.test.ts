import { afterEach, describe, expect, it } from 'vitest'

import { dayMonth, editionDate, isCalendarDate, monthYear, shiftDays, weekdayOf } from './date'

// An edition date is a calendar day the pipeline wrote, not an instant. Every
// bug this file exists to catch comes from treating it as an instant: the page
// is prerendered on a UTC build machine and read in every timezone there is,
// and `new Date('2026-08-09')` is midnight UTC, which is still the 8th for
// everyone west of Greenwich.
//
// Two independent defences, both tested here:
//
//   1. Parse at noon UTC, so the instant sits as far from either midnight as it
//      can — this is what design-refs/build-home.mjs does.
//   2. Format with an explicit `timeZone: 'UTC'`, so the local zone is not
//      consulted at all.
//
// Defence 1 alone is not actually enough, which is why defence 2 is here: the
// real offset range is UTC−12 to UTC+14, so noon UTC is already tomorrow in
// Pacific/Kiritimati. The generator has that hole. Both files agree in every
// zone the generator is right in, so the visual gate still compares like with
// like — this one is right in the two zones it is not.

const ORIGINAL_TZ = process.env.TZ

// Assigning undefined to process.env stores the string "undefined", which is
// not a timezone — restoring an unset TZ has to delete the key instead, or
// every test after the first one runs in whatever Node falls back to.
function restoreTZ() {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
}

function underTZ<T>(tz: string, fn: () => T): T {
  process.env.TZ = tz
  try {
    return fn()
  } finally {
    restoreTZ()
  }
}

afterEach(restoreTZ)

// Kiritimati is UTC+14 and Recife UTC−3: the two ends that break the two naive
// implementations. Recife is the zone this was first seen wrong in.
const ZONES = [
  'UTC',
  'America/Los_Angeles',
  'Asia/Tokyo',
  'America/Recife',
  'Pacific/Kiritimati',
]

describe('the test harness itself', () => {
  // Asserted rather than assumed: if reassigning process.env.TZ mid-process
  // stopped taking effect, every timezone test below would pass by doing
  // nothing at all. The naive implementation is the control — it must give two
  // different answers for the same date, and one of them must be wrong.
  it('changes the timezone the runtime formats in', () => {
    const naive = (tz: string) =>
      underTZ(tz, () =>
        new Date('2026-08-09').toLocaleDateString('en-GB', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        }),
      )

    expect(naive('Asia/Tokyo')).toBe('Sunday 9 August')
    expect(naive('America/Los_Angeles')).toBe('Saturday 8 August')
  })
})

// The bug this closes, kept as a case rather than a comment.
//
// `2026-02-29` matches the shape of a date and is not a day. `new Date` does not
// answer NaN for it — it rolls forward — so a shape-only check let a filename
// that names no day reach the masthead, which then printed the rolled day in the
// largest type on the page while /archive linked to a 404.
describe('isCalendarDate', () => {
  it('accepts a day that exists', () => {
    for (const day of ['2026-08-09', '2024-02-29', '2026-01-01', '2026-12-31']) {
      expect(isCalendarDate(day)).toBe(true)
    }
  })

  it('rejects a date that rolls forward rather than failing', () => {
    // The whole finding: none of these is NaN, and every one of them is a lie.
    expect(new Date('2026-02-29T12:00:00Z').toISOString().slice(0, 10)).toBe('2026-03-01')
    expect(isCalendarDate('2026-02-29')).toBe(false)
    expect(isCalendarDate('2026-04-31')).toBe(false)
    expect(isCalendarDate('2026-06-31')).toBe(false)
  })

  it('rejects a month or day outside the calendar', () => {
    for (const value of ['2026-13-01', '2026-00-05', '2026-08-00', '2026-08-32']) {
      expect(isCalendarDate(value)).toBe(false)
    }
  })

  it('rejects anything that is not the shape', () => {
    for (const value of ['banana', '2026-8-9', '', '2026-08-09T00:00:00Z', '26-08-09']) {
      expect(isCalendarDate(value)).toBe(false)
    }
  })

  it('never throws, whatever it is handed', () => {
    for (const value of ['', '\u0000', 'x'.repeat(5000)]) {
      expect(() => isCalendarDate(value)).not.toThrow()
    }
  })
})

// Every formatter goes through `atNoonUTC`, so the rule reaches all of them.
describe('the formatters refuse a date that is not a day', () => {
  it.each([['editionDate', editionDate], ['dayMonth', dayMonth], ['monthYear', monthYear], ['weekdayOf', weekdayOf]])(
    '%s throws for 2026-02-29 rather than printing 1 March',
    (_, fn) => {
      expect(() => fn('2026-02-29')).toThrow(/not a calendar date/)
    },
  )
})

describe('editionDate', () => {
  for (const tz of ZONES) {
    it(`reads 2026-08-09 as Sunday 9 August in ${tz}`, () => {
      expect(underTZ(tz, () => editionDate('2026-08-09'))).toBe('Sunday 9 August')
    })
  }

  it('carries the year when the edition is not from the current year', () => {
    const now = new Date('2026-08-09T12:00:00Z')
    expect(editionDate('2025-12-31', now)).toBe('Wednesday 31 December 2025')
  })

  it('omits the year when the edition is from the current year', () => {
    const now = new Date('2026-08-09T12:00:00Z')
    expect(editionDate('2026-01-01', now)).toBe('Thursday 1 January')
  })

  it('rejects anything that is not a calendar date', () => {
    expect(() => editionDate('banana')).toThrow(/banana/)
    expect(() => editionDate('2026-13-01')).toThrow()
  })
})

describe('weekdayOf', () => {
  // The masthead sets the weekday in its own span, so it is a separate value
  // rather than a substring anyone has to slice back out of editionDate.
  for (const tz of ZONES) {
    it(`is Sunday for 2026-08-09 in ${tz}`, () => {
      expect(underTZ(tz, () => weekdayOf('2026-08-09'))).toBe('Sunday')
    })
  }
})

describe('dayMonth', () => {
  it('is the edition bar’s short form', () => {
    expect(dayMonth('2026-08-09')).toBe('9 August')
    expect(dayMonth('2026-08-08')).toBe('8 August')
  })

  for (const tz of ZONES) {
    it(`does not slip a day in ${tz}`, () => {
      expect(underTZ(tz, () => dayMonth('2026-08-09'))).toBe('9 August')
    })
  }

  it('carries the year for a date outside the current year', () => {
    const now = new Date('2026-08-09T12:00:00Z')
    expect(dayMonth('2025-12-31', now)).toBe('31 December 2025')
  })
})

describe('monthYear', () => {
  it('is the archive index’s month heading, always with the year', () => {
    expect(monthYear('2026-08-08')).toBe('August 2026')
    expect(monthYear('2026-08-31')).toBe('August 2026')
  })

  for (const tz of ZONES) {
    // The month is the place this bug hides best: a first-of-the-month edition
    // formatted from a local Date heads the list under the *previous* month
    // west of Greenwich, one grouping key away from anyone noticing.
    it(`does not slip a month on the first of the month in ${tz}`, () => {
      expect(underTZ(tz, () => monthYear('2026-09-01'))).toBe('September 2026')
    })
  }
})

describe('shiftDays', () => {
  // The edition bar prints the calendar neighbour's date when no edition
  // exists in that direction. Doing that arithmetic with a local Date is the
  // same off-by-one in a second place, so it lives here.
  it('walks forwards and backwards', () => {
    expect(shiftDays('2026-08-09', -1)).toBe('2026-08-08')
    expect(shiftDays('2026-08-09', 1)).toBe('2026-08-10')
  })

  it('crosses a month, a year and a leap day', () => {
    expect(shiftDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(shiftDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(shiftDays('2024-02-28', 1)).toBe('2024-02-29')
  })

  for (const tz of ZONES) {
    it(`crosses a daylight-saving boundary unharmed in ${tz}`, () => {
      // 2026-03-08 is the US spring-forward; a local-time +1 day is 23 hours
      // there and lands on the same date it started.
      expect(underTZ(tz, () => shiftDays('2026-03-08', 1))).toBe('2026-03-09')
    })
  }
})
