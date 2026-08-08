import { mapWithConcurrency } from './concurrency'
import { parseFeed } from './parse'
import { buildRequestUrls } from './sources'
import type { RawItem, Source } from './types'

/**
 * The collection stage: every source expanded into its requests, fetched under
 * a concurrency cap, parsed, and reduced to items plus the ids of the sources
 * that produced nothing.
 *
 * The network itself is injected. `collect` never calls `fetch`; the tests pass
 * a stub and the script passes `httpFetcher`, which is the only function here
 * that touches a socket and is imported by no test.
 */

/** One request. Rejecting is an ordinary outcome, not an exception path. */
export type Fetcher = (url: string) => Promise<string>

export type CollectOptions = {
  /** Lower bound of the window, forwarded to sources that filter server-side. */
  since: Date
  concurrency: number
}

export type CollectResult = {
  items: RawItem[]
  /** Source **ids** — never URLs — of the sources that yielded nothing. */
  failures: string[]
}

const REQUEST_TIMEOUT_MS = 20_000

/**
 * Several of the feeds answer a default Node user agent with 403. This is the
 * one place the pipeline presents itself as a browser.
 */
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

/**
 * Fetch one feed body over the network.
 *
 * A non-2xx response throws so the caller counts it as a failed request rather
 * than handing an error page to the parser. The timeout is per request, and the
 * concurrency cap is what keeps a batch of them from all expiring at once.
 *
 * **Not used by any test.** Nothing in the suite may import it — every test
 * injects its own `Fetcher`.
 */
export const httpFetcher: Fetcher = async (url) => {
  const response = await fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
      accept: 'application/rss+xml, application/atom+xml, application/xml, application/json, text/xml;q=0.9, */*;q=0.8',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`)
  }

  return response.text()
}

type Request = {
  source: Source
  url: string
}

/**
 * Fetch and parse every source.
 *
 * One source can mean several requests — Hacker News is one Algolia call per
 * query — so the pool is fed the flattened request list, not the source list.
 * That way a source with four URLs cannot occupy four times its share of the
 * budget through nesting, and the cap holds across the whole batch.
 *
 * A source fails when it ends up with no items at all: every request rejected,
 * or the bodies came back unparseable, or the feed was empty. From the
 * pipeline's side those are the same event — the source contributed nothing —
 * and the run aborts past a threshold of them (Task 12).
 */
export async function collect(
  sources: readonly Source[],
  fetcher: Fetcher,
  opts: CollectOptions,
): Promise<CollectResult> {
  const requests: Request[] = sources.flatMap((source) =>
    buildRequestUrls(source, { since: opts.since }).map((url) => ({ source, url })),
  )

  const responses = await mapWithConcurrency(requests, opts.concurrency, (request) =>
    fetcher(request.url),
  )

  // Results come back in request order, and requests are in source order, so
  // grouping by source id preserves the registry's order in `items`.
  const bySource = new Map<string, RawItem[]>()
  for (const source of sources) bySource.set(source.id, [])

  responses.forEach((response, index) => {
    if (response.status !== 'fulfilled') return
    const { source } = requests[index]
    bySource.get(source.id)?.push(...parseFeed(source, response.value))
  })

  const items: RawItem[] = []
  const failures: string[] = []

  for (const source of sources) {
    const collected = bySource.get(source.id) ?? []
    if (collected.length === 0) failures.push(source.id)
    else items.push(...collected)
  }

  return { items, failures }
}
