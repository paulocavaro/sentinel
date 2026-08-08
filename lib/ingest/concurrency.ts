/**
 * A worker pool with a hard ceiling on in-flight work.
 *
 * `Promise.allSettled` over a hundred feed URLs opens a hundred sockets at
 * once: hosts answer with 429 or block the runner outright, and every slow host
 * reaches its timeout in the same window. This bounds the concurrency for real
 * — at most `limit` calls to `fn` are pending at any moment, and a worker only
 * picks up its next item once its current one has settled.
 *
 * Two properties the callers depend on:
 *
 * - **Order.** Results are indexed by input position, not by completion order,
 *   so `results[i]` always belongs to `items[i]`.
 * - **Isolation.** A rejection is captured as a settled result. One dead source
 *   never fails the batch.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length)
  if (items.length === 0) return results

  // Never spawn more workers than there is work, and never fewer than one —
  // a zero or NaN limit would otherwise stall the pool forever.
  const workerCount = Math.max(1, Math.min(Math.trunc(limit) || 1, items.length))

  // The shared cursor is what bounds the work: every worker loops, claiming the
  // next unclaimed index. JavaScript's single-threaded turn makes `next++`
  // atomic, so no index is ever claimed twice.
  let next = 0

  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++
      try {
        results[index] = { status: 'fulfilled', value: await fn(items[index], index) }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()))

  return results
}
