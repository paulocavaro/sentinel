/**
 * A ceiling on how many questions one caller may ask.
 *
 * `POST /api/ask` is the only route on this site that costs money to serve, and
 * nothing else bounds how often it is called. The spec bounds the cost of a
 * single answer — one model, a fixed effort, a capped output — and left the
 * number of answers open. This closes it: ten questions per ten minutes per
 * caller, counted in a Map of timestamps that lives in the instance's memory.
 *
 * **Two things this is not, said here rather than found out later.**
 *
 * **The key is spoofable.** `x-forwarded-for` is a request header, and a header
 * is whatever the client typed. Anyone willing to send a different value on
 * every request gets a fresh bucket every time, and nothing here can tell.
 * `x-real-ip` is better — Vercel's proxy writes it, and a value the proxy sets
 * cannot be dictated by the caller — but this module cannot verify which of the
 * two it is holding. So: a speed bump against casual cost and accidental loops,
 * not a security control. Anything that has to actually hold belongs at the
 * platform edge, in the WAF, where the connection's real address is known.
 *
 * **The map is per instance.** There is no shared store behind this, so two
 * instances serving the same caller each count to ten, and an instance that
 * recycles forgets every counter it held. Fluid Compute reuses instances, so in
 * practice a burst from one caller usually meets one instance and the limit
 * usually holds; "usually" is the honest word and it is the word the design
 * accepted. The alternative is a datastore, and a datastore is the wrong shape
 * for a site whose entire claim is that it is files in a repository — it would
 * add a service to operate, a credential to rotate and a second source of
 * runtime truth, in order to make a speed bump slightly harder to step over.
 */

/** How long a question is remembered for. */
export const WINDOW_MS = 10 * 60_000

/**
 * How many questions one key may ask inside a window.
 *
 * Ten and ten minutes, together, are shaped by the product rather than by a
 * cost model: a series is three questions, so a reader who asks, reads, and
 * asks again has room for three full series before this ever speaks. Someone
 * past that in ten minutes is not reading the answers.
 */
export const MAX_IN_WINDOW = 10

/**
 * Where callers land when no header identifies them.
 *
 * Named rather than inlined because everyone in it shares one allowance, which
 * is a real behaviour: local development, a `curl` with no proxy in front of
 * it, and any future in which the platform stops setting both headers all
 * collapse into this one bucket. Sharing is the safe direction to be wrong in —
 * the failure is a limit that is too tight, not a limit that does nothing.
 */
export const SHARED_BUCKET = 'unknown'

/** Question timestamps per key, newest last, nothing outside the window. */
const buckets = new Map<string, number[]>()

/**
 * The last time every key was checked for expiry, not just the one being asked
 * about.
 *
 * Starts at `-Infinity` so the first call sweeps: that keeps the sweep's timing
 * a function of the injected clock alone, with no hidden dependency on when the
 * module happened to be loaded.
 */
let lastSweep = Number.NEGATIVE_INFINITY

/**
 * Drop every key whose questions have all expired.
 *
 * Pruning a bucket on read only reclaims keys that come back, and the keys that
 * cost memory are precisely the ones that never do — one question from one
 * reader, an entry held for the lifetime of the instance. So the map is swept
 * whole, and throttled to once per window because a sweep is O(keys) and the
 * oldest thing it could possibly find is one window old anyway.
 *
 * **Time alone is not a bound on size.** The header the key comes from is
 * client-settable, so a caller sending a different one every request gets a
 * fresh entry every request — and the time throttle means nothing is reclaimed
 * until the burst is a full window old. That is a burst of held keys, not a
 * steady state, and the test that "proves the map does not grow forever" only
 * ever proved the steady state. `CEILING` is the other half: past it, the sweep
 * runs whatever the clock says. The keys it can free are still only the expired
 * ones, so a burst inside one window is bounded by memory rather than erased —
 * but the model calls those same requests buy cost more than their keys do, and
 * the limiter has never claimed to be the thing standing in front of that.
 *
 * **Exported for its test and nothing else**, the way `bucketCount` is. A test
 * has to write *past* this number for the ceiling to do anything at all, so it
 * needs to know it; and one that hard-coded `10_000` would still pass against a
 * `CEILING` of five and against one of fifty thousand — it would be asserting
 * its own literal rather than the module's bound. Nothing in the running product
 * reads this.
 */
export const CEILING = 10_000

function sweep(now: number): void {
  if (now - lastSweep < WINDOW_MS && buckets.size < CEILING) return
  lastSweep = now

  for (const [key, times] of buckets) {
    if (times.length === 0 || times[times.length - 1] <= now - WINDOW_MS) buckets.delete(key)
  }
}

/**
 * Spend one question's worth of allowance for `key`.
 *
 * The clock is a parameter rather than a call to `Date.now()` inside, so the
 * tests state instants instead of installing a fake timer, and so there is
 * exactly one clock in the module.
 *
 * **A refusal does not count.** Recording refused attempts would slide the
 * window forward every time a blocked caller retried, and a client retrying in
 * a loop would lock itself out for as long as it kept trying — a permanent ban
 * wearing a ten-minute limit's clothes, and not a decision anyone made.
 *
 * `retryAfter` is **seconds**, because its one consumer is the `Retry-After`
 * header, which is defined in seconds. It is the wait until the oldest question
 * in the window expires, rounded up and floored at one: rounding down would
 * produce `Retry-After: 0`, which invites an immediate retry into a refusal
 * that has not expired yet.
 */
export function takeToken(
  key: string,
  now: number = Date.now(),
): { ok: true } | { ok: false; retryAfter: number } {
  sweep(now)

  const cutoff = now - WINDOW_MS
  const times = (buckets.get(key) ?? []).filter((time) => time > cutoff)

  if (times.length >= MAX_IN_WINDOW) {
    // `times` is in ascending order — questions are appended as they arrive —
    // so the first entry is the one that frees a slot when it expires.
    buckets.set(key, times)
    return { ok: false, retryAfter: Math.max(1, Math.ceil((times[0] + WINDOW_MS - now) / 1000)) }
  }

  times.push(now)
  buckets.set(key, times)
  return { ok: true }
}

/**
 * Which caller a request counts against.
 *
 * `x-real-ip` first: on Vercel the proxy sets it, so it is the one value here
 * that did not pass through the client's hands. Then the first entry of
 * `x-forwarded-for`, which by convention reads client-first with each proxy
 * appending itself. Then the shared bucket.
 *
 * There is no fourth option. `NextRequest.ip` was removed in Next 15, and the
 * connection's own address is not reachable from a route handler — on Vercel
 * every request arrives from the platform's proxy, so it would be the same
 * address for everyone even if it were.
 */
export function bucketKey(headers: Headers): string {
  const real = headers.get('x-real-ip')?.trim()
  if (real) return real

  // Only the first entry, and trimmed: a chain is "client, proxy, proxy" with a
  // space after each comma by convention but not by rule, and one caller
  // arriving through two proxies that disagree about whitespace must not count
  // as two callers.
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (forwarded) return forwarded

  return SHARED_BUCKET
}

/**
 * How many keys the map is currently holding.
 *
 * Exported for the one test that proves the map does not grow forever. That
 * property is invisible through `takeToken` — a forgotten key and an expired
 * one answer identically — so either it gets a named accessor or it goes
 * untested and the leak returns the first time somebody edits `sweep`. Nothing
 * in the running product calls this.
 */
export function bucketCount(): number {
  return buckets.size
}

/**
 * Forget every counter.
 *
 * Module state outlives a test case, so without this the order of the test file
 * would become part of its meaning. Named the way `resetIndexForTests` in
 * `corpus.ts` is named, and for the same reason: a reset that is greppable, and
 * the only supported way to do it.
 */
export function resetLimitForTests(): void {
  buckets.clear()
  lastSweep = Number.NEGATIVE_INFINITY
}
