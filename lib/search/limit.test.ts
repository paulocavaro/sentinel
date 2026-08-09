// The rate limit, tested with the clock passed in rather than faked.
//
// Every case here names its own instants as plain numbers on a timeline that
// starts at zero. That is the whole reason `takeToken` takes a `now`: a fake
// timer library would let these tests read `vi.advanceTimersByTime(WINDOW_MS)`
// and would also let the module reach for `Date.now()` in a second place one
// day and still pass. With the clock as an argument there is exactly one clock,
// it belongs to the caller, and a test that says `WINDOW_MS + 1` is stating a
// fact about the window rather than about a mock.
//
// The map is module state, so `resetLimitForTests()` runs before each case.
// Without it the order of the file becomes part of its meaning.

import { beforeEach, describe, expect, it } from 'vitest'

import {
  CEILING,
  MAX_IN_WINDOW,
  SHARED_BUCKET,
  WINDOW_MS,
  bucketCount,
  bucketKey,
  resetLimitForTests,
  takeToken,
} from './limit'

beforeEach(() => {
  resetLimitForTests()
})

/** Spend `count` tokens on one key, all at the same instant. */
function drain(key: string, count: number, now: number): void {
  for (let i = 0; i < count; i += 1) takeToken(key, now)
}

describe('takeToken', () => {
  it('allows the first question', () => {
    expect(takeToken('198.51.100.4', 0)).toEqual({ ok: true })
  })

  it('allows up to MAX_IN_WINDOW', () => {
    // Spread across the window rather than fired at one instant, because the
    // limit is a sliding window and not a per-tick counter: ten questions typed
    // over nine minutes are still ten questions.
    for (let i = 0; i < MAX_IN_WINDOW; i += 1) {
      expect(takeToken('198.51.100.4', i * 60_000)).toEqual({ ok: true })
    }
  })

  it('refuses the one after that, and says how long to wait', () => {
    drain('198.51.100.4', MAX_IN_WINDOW, 0)

    // One minute in, the oldest of the ten timestamps leaves the window nine
    // minutes from now — so that is the wait, in seconds, and it is a real
    // number the caller can put in a `Retry-After` header rather than a flag.
    expect(takeToken('198.51.100.4', 60_000)).toEqual({
      ok: false,
      retryAfter: (WINDOW_MS - 60_000) / 1000,
    })
  })

  it('allows again once the window has passed', () => {
    drain('198.51.100.4', MAX_IN_WINDOW, 0)
    expect(takeToken('198.51.100.4', WINDOW_MS - 1)).toMatchObject({ ok: false })

    // The instant the first ten fall out of the window, the eleventh is a first
    // question again.
    expect(takeToken('198.51.100.4', WINDOW_MS)).toEqual({ ok: true })
  })

  it('counts each key separately', () => {
    drain('198.51.100.4', MAX_IN_WINDOW, 0)

    expect(takeToken('198.51.100.4', 0)).toMatchObject({ ok: false })
    expect(takeToken('198.51.100.8', 0)).toEqual({ ok: true })
  })

  it('does not count a refused question, so hammering cannot extend the wait', () => {
    drain('198.51.100.4', MAX_IN_WINDOW, 0)

    // Fifty refusals at the five-minute mark. If a refusal recorded its own
    // timestamp the window would keep sliding forward under the caller and the
    // wait would never end — a client retrying in a loop would lock itself out
    // permanently, which is a different product decision than "ten per ten
    // minutes" and not one anybody made.
    for (let i = 0; i < 50; i += 1) takeToken('198.51.100.4', WINDOW_MS / 2)

    expect(takeToken('198.51.100.4', WINDOW_MS)).toEqual({ ok: true })
  })

  it('never says to come back in zero seconds', () => {
    drain('198.51.100.4', MAX_IN_WINDOW, 0)

    // A hair before the window closes the honest arithmetic rounds to nothing,
    // and `Retry-After: 0` reads as an invitation to retry immediately — into
    // the refusal that has not expired yet.
    expect(takeToken('198.51.100.4', WINDOW_MS - 1)).toEqual({ ok: false, retryAfter: 1 })
  })

  it('forgets keys that have gone quiet, so the map cannot grow forever', () => {
    // Two callers ask once each, a minute apart, and are never heard from
    // again. Nothing about the public answer would ever reveal that their
    // counters are still held — which is exactly why the leak needs its own
    // test and its own named accessor.
    takeToken('198.51.100.4', 0)
    takeToken('198.51.100.8', 60_000)
    expect(bucketCount()).toBe(2)

    // A third caller, long after both windows closed. The sweep runs on the way
    // in, so the map holds only the key that is actually live.
    takeToken('198.51.100.12', WINDOW_MS * 3)
    expect(bucketCount()).toBe(1)
  })

  it('keeps a key that is still inside its window when it sweeps', () => {
    takeToken('198.51.100.4', 0)
    drain('198.51.100.8', MAX_IN_WINDOW, WINDOW_MS - 1)

    // A third caller arrives late enough to trigger the sweep. The sweep is a
    // memory measure and not a second limiter, so it may only drop buckets
    // whose every timestamp has already expired — the first key, and not the
    // second.
    takeToken('198.51.100.12', WINDOW_MS + 1)
    expect(bucketCount()).toBe(2)

    // Which the count alone cannot prove: the surviving key must still be
    // holding all ten of its questions, not an emptied bucket that happens to
    // exist. A sweep that quietly reset live counters would read as generous
    // rather than as broken.
    expect(takeToken('198.51.100.8', WINDOW_MS + 1)).toMatchObject({ ok: false })
  })

  it('sweeps once the map passes CEILING, even though the clock says not to yet', () => {
    // Time bounds retention; it does not bound cardinality. The key comes off a
    // client-settable header, so a caller inventing a new value per request gets
    // a fresh entry per request — and while the sweep is throttled to once per
    // window, none of them are reclaimed until the burst is a full window old.
    // The test above proves the steady state and cannot see this at all: it
    // waits for the clock, which is the very thing that is not going to save us.
    //
    // Everything below happens inside one throttle period, so the ceiling is the
    // only thing that can make a sweep run.

    // Three instants, arranged so that at `WINDOW_MS + 1` the map holds one
    // expired key, one live key, and a throttle that was reset a millisecond
    // ago. The two stamps one apart are the whole trick: the sweep at
    // `WINDOW_MS` may free the key stamped 0 and may not free the key stamped 1,
    // so the second one goes on to expire *while the throttle is still closed* —
    // which is the only window in which the ceiling has anything to free.
    takeToken('198.51.100.12', 0) // the first call ever, so it sweeps: lastSweep = 0
    takeToken('198.51.100.4', 1) // a millisecond later, and no sweep travels with it
    drain('198.51.100.8', MAX_IN_WINDOW, WINDOW_MS) // due on time: sweeps, lastSweep = WINDOW_MS

    // `198.51.100.12` was dropped by that sweep and `198.51.100.4` survived it.
    expect(bucketCount()).toBe(2)

    // A burst of invented keys, all at one instant. Not addresses: an attacker
    // spending this site's model budget is making header values up, not cycling
    // real hosts, and the module treats a key as an opaque string either way.
    const now = WINDOW_MS + 1
    for (let i = 0; i < CEILING; i += 1) takeToken(`spoofed-${i}`, now)

    // The burst plus `198.51.100.8`, and *not* `198.51.100.4`. Under the time throttle
    // alone nothing would have been reclaimed and this would read `CEILING + 2`
    // — one key's worth of difference, because that is all there was to free
    // inside a single window. The size of the number is not the point; that a
    // sweep ran at all with the clock refusing to authorise one is.
    expect(bucketCount()).toBe(CEILING + 1)

    // And it is still a memory measure rather than a second limiter: the live
    // key kept all ten of its questions rather than being emptied on the way
    // past. A ceiling sweep that reset live counters would hand every caller in
    // the map a fresh allowance the moment an attacker filled it — which is a
    // way of making a flood *profitable*.
    expect(takeToken('198.51.100.8', now)).toMatchObject({ ok: false })
  })

  it('reads the wall clock when no instant is given', () => {
    // The default argument is the production path — the route calls
    // `takeToken(key)` with no clock at all — so it is worth one case rather
    // than being reached only by code nothing tests.
    for (let i = 0; i < MAX_IN_WINDOW; i += 1) {
      expect(takeToken('198.51.100.4')).toEqual({ ok: true })
    }

    expect(takeToken('198.51.100.4')).toMatchObject({ ok: false })
  })
})

describe('bucketKey', () => {
  it('prefers x-real-ip', () => {
    const headers = new Headers({
      'x-real-ip': '203.0.113.7',
      'x-forwarded-for': '198.51.100.4, 203.0.113.7',
    })

    // Vercel's proxy sets `x-real-ip` itself, so where both are present it is
    // the one that did not travel through the client's hands.
    expect(bucketKey(headers)).toBe('203.0.113.7')
  })

  it('falls back to the first entry of x-forwarded-for', () => {
    // The chain reads client, then each proxy that added itself. The first
    // entry is the closest thing to the caller on offer.
    const headers = new Headers({ 'x-forwarded-for': '198.51.100.4, 203.0.113.18, 203.0.113.178' })

    expect(bucketKey(headers)).toBe('198.51.100.4')
  })

  it('trims the space after the comma that proxies conventionally write', () => {
    const headers = new Headers({ 'x-forwarded-for': '  198.51.100.4  ,  203.0.113.18' })

    // Untrimmed, one caller arriving through two proxies that disagree about
    // whitespace would count as two callers.
    expect(bucketKey(headers)).toBe('198.51.100.4')
  })

  it('falls back to a shared bucket when neither is present', () => {
    // Local development, a curl with no proxy in front of it, or a platform
    // that stopped setting either header. Everyone lands in one bucket, which
    // is the safe direction to be wrong in for a limiter.
    expect(bucketKey(new Headers())).toBe(SHARED_BUCKET)
  })

  it('treats an empty header as absent rather than as a key of its own', () => {
    const headers = new Headers({ 'x-real-ip': '   ', 'x-forwarded-for': '' })

    // An empty string is a perfectly usable Map key, which is the problem: it
    // would silently become a second shared bucket that no comment mentions.
    expect(bucketKey(headers)).toBe(SHARED_BUCKET)
  })

  it('skips an empty x-real-ip in favour of the forwarded chain', () => {
    const headers = new Headers({ 'x-real-ip': '', 'x-forwarded-for': '198.51.100.4' })

    expect(bucketKey(headers)).toBe('198.51.100.4')
  })
})
