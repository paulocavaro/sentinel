import MiniSearch from 'minisearch'

import { listEditionDates, readEdition } from '../edition'
import type { Edition, EditionItem } from '../edition'

/**
 * The archive, made searchable.
 *
 * Named `corpus.ts` rather than `index.ts`: inside its own directory the latter
 * reads as `from './index'`, and `from '@/lib/search'` would resolve to it
 * implicitly — one module with two spellings. This repository has paid for an
 * ambiguous name once already, when `source` had to become `feed`.
 *
 * The index is built from `content/days/` through the same two readers the
 * pages use, and never from a build-time artefact. An artefact would be faster
 * and would be a second source of truth that can fall out of step with the
 * files actually committed — the one failure a product whose entire claim is
 * *the record is the files* cannot afford.
 *
 * **A document is an item, keyed by the item's own id.** That is sound because
 * the id is a hash of the canonical URL and `excludePublished` will not let a
 * story run in two editions, so no compound key is needed and MiniSearch's
 * duplicate-id throw stays unreachable. If that ever changes the throw is the
 * right place to find out, which is why nothing here catches it.
 */

/** An item as the search returns it: the whole item, plus the day it ran on. */
export type Hit = EditionItem & { date: string }

/**
 * How many items one search may hand back.
 *
 * Eight, not thirty. This bounds what the model is shown per call, and the tool
 * loop can search again if eight were the wrong eight — whereas a hundred items
 * of third-party text in one tool result costs tokens and buries the relevant
 * ones among near-misses that fuzzy matching dragged in.
 */
export const MAX_HITS = 8

/**
 * Index every item in every edition.
 *
 * Indexed: `title`, `description`, `topics` — what the spec names, and between
 * them the only prose an edition holds. Publisher is deliberately not indexed:
 * every item carries one, so "reuters" would match a third of the archive on a
 * word the reader meant as a filter.
 *
 * **Stored: every field of `Hit`, not only the ones a citation prints.** The
 * tempting version stores five fields and casts the result to `Hit` anyway —
 * and that type then promises a `topics` and a `publishedAt` that are simply
 * not in the object, so the first caller to read one gets `undefined` with no
 * error anywhere near the cause. Storing the lot costs roughly the archive's
 * own size in memory, which is a few hundred short records, and buys a type
 * that is true.
 */
export function buildIndex(editions: readonly Edition[]): MiniSearch<Hit> {
  const index = new MiniSearch<Hit>({
    fields: ['title', 'description', 'topics'],
    storeFields: [
      'id',
      'rank',
      'title',
      'description',
      'url',
      'publisher',
      'feed',
      'publishedAt',
      'image',
      'topics',
      'theme',
      'date',
    ],
    // `topics` is the one indexed field that is not a string. Joining it here
    // rather than in `extractField` matters: `extractField` also feeds
    // `storeFields`, so flattening there would store the topics as a string and
    // make `Hit.topics` a lie. And joining explicitly rather than letting
    // `Array.prototype.toString` produce "models,anthropic" says what we mean
    // instead of resting on the default tokenizer splitting on the comma.
    stringifyField: (value: unknown) =>
      Array.isArray(value) ? value.join(' ') : String(value),
  })

  index.addAll(
    editions.flatMap((edition) => edition.items.map((item) => ({ ...item, date: edition.date }))),
  )

  return index
}

/**
 * The items matching a reader's question, best first.
 *
 * `prefix` because a half-typed word is a question too, and this is search over
 * a few hundred records rather than a ranked web index. `fuzzy: 0.2` for the
 * misspelling a reader makes once and the transliteration two outlets disagree
 * on; higher and unrelated stories start arriving, which is worse here than a
 * miss because the model is told these are the facts.
 *
 * **An empty query answers empty, not everything.** MiniSearch happens to agree
 * today, tokenising `''` to no terms — but the query arriving in Task 3 is
 * written by the model, and a whitespace query silently returning the eight
 * highest-scoring items in the archive is exactly the kind of accident that
 * reads like a working answer. The contract is stated at our boundary rather
 * than inherited from a dependency's behaviour on an input it was not asked
 * about.
 */
export function searchNews(index: MiniSearch<Hit>, query: string, limit = MAX_HITS): Hit[] {
  if (query.trim() === '') return []

  // The cast is a double one because MiniSearch types a result as its own
  // fields plus an index signature, and TypeScript will not read a `title` out
  // of `[key: string]: any` to satisfy `Hit`. What makes it honest rather than
  // convenient is the `storeFields` list above: it names every field of `Hit`,
  // so each one is genuinely on the object at runtime. Narrow that list and
  // this line starts lying.
  return index
    .search(query, { prefix: true, fuzzy: 0.2, combineWith: 'OR' })
    .slice(0, limit) as unknown as Hit[]
}

/**
 * Every readable edition, newest first.
 *
 * `listEditionDates` has already parsed each file to decide it is readable, so
 * the null filter below is a type obligation rather than a real branch. Both
 * readers swallow their own I/O failures — a missing directory is a fresh
 * clone, not an error — so nothing in *this* function rejects.
 *
 * That is not the same as `archiveIndex` never caching a rejection, which is
 * what this comment used to claim. `buildIndex` runs inside the cached chain and
 * `addAll` throws on a duplicate id; see the note there.
 */
async function readArchive(): Promise<Edition[]> {
  const dates = await listEditionDates()
  const editions = await Promise.all(dates.map((date) => readEdition(date)))
  return editions.filter((edition): edition is Edition => edition !== null)
}

let cached: Promise<MiniSearch<Hit>> | null = null

/**
 * The index over the whole archive, built once per instance.
 *
 * **There is no invalidation here because there is no way for it to go stale.**
 * A new edition means a push, a push means a Vercel build, and a build means
 * new instances — the deployment's filesystem is a snapshot, so `content/days`
 * cannot change under a running process. This reads exactly the files the pages
 * read and keeps exactly that property; it just stops paying for the read on
 * every question.
 *
 * The *promise* is cached rather than the resolved value, so two questions
 * arriving at a cold instance at once build one index rather than two.
 *
 * **A failure is not cached, and that took a review to notice.** `??=` reassigns
 * on null and undefined only, and a rejected promise is neither — so without the
 * `catch` below, one throw out of `buildIndex` would be handed to every later
 * question for the life of the instance. It is reachable: `addAll` throws on a
 * duplicate id, which is a bad edition rather than a bad request, and the reader
 * would get a 500 on every question until the instance recycled. Clearing the
 * slot makes that a per-request failure that the next deploy or the next request
 * can recover from. The error is rethrown, so this call still fails.
 */
export function archiveIndex(): Promise<MiniSearch<Hit>> {
  cached ??= readArchive()
    .then(buildIndex)
    .catch((error: unknown) => {
      cached = null
      throw error
    })

  return cached
}

/**
 * Forget the cached index.
 *
 * Exported so a test resets it by name rather than reaching into module state,
 * which makes the reset a greppable thing and the only supported way to do it.
 * Nothing in the running product calls this — see above for why it would have
 * nothing to fix.
 */
export function resetIndexForTests(): void {
  cached = null
}
