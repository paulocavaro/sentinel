# Sentinel — Product Spec

A daily edition of AI, world, games, science and culture news. Every morning a
pipeline reads eighteen sources, a model picks the thirty items that matter,
ranks them and files each under one theme, and the result is committed to this
repository as a dated JSON file. Every page is static; the one thing that runs on
demand is the search.

Thirty items, five themes. Then the day ends.

## Principles

**The day ends.** There is no infinite scroll, no "load more", no algorithmic
tail. An edition has thirty items and a bottom. Finishing it is possible, and
that is the point.

**Themes are a lens, not a section.** An item carries exactly one of `ai`,
`world`, `games`, `science` or `culture`, and the edition is one ranked sequence
across all five — not five lists stapled together. The reader's priority lives in
how many items each theme may carry, so nothing is ever demoted for its theme.
A theme with no news that day is simply absent, and that is a correct edition:
the filter row is derived from the themes present in the day's items, never from
a hardcoded list of five.

**Honest about its own limits.** Search answers only from what the archive
actually contains. If nothing matches, the answer is "there is no story about
that here" — never a plausible answer assembled from model knowledge. A news
product that invents is worse than a news product that is silent.

**Never publish broken.** If any step of the pipeline fails — fetch, model call,
validation — nothing is written and yesterday's edition stays live, clearly
marked as yesterday's. A stale edition is a fine outcome. A wrong one is not.

**Links out, does not republish.** Sentinel stores headlines, one-line
descriptions and images. The article itself always opens at the source.

## Screens

| Route | What it is |
|---|---|
| `/` | Today's edition: the day in one line, a filter row of the themes actually present, then thirty cards. One card per row on mobile. Tapping a card opens the original article in a new tab. |
| `/day/[date]` | One day of the archive. Same layout, another date, with navigation between days. Every day the archive spans is a page, including the days that published nothing — those say so and offer the editions either side. |
| `/archive` | The index: every edition there has been, grouped by month, newest first. It lists only the days that published, because a link to a day that ran nothing is a footnote rather than an entry. |
| `/states` | The catalogue of the conditions that are not an ordinary day, rendered as a page so they cannot rot unseen. Not a reader's screen; it exists to be looked at when the design changes. |

**Search is not a route.** Whether it was a full screen or a launcher pinned to
the corner was left to the design phase, and the design phase chose the launcher:
a button that opens a `<dialog>` over whichever screen the reader is on.

Answers cite the item and say which day it ran, and the day is a link to that
day. A series holds at most three questions — a follow-up sends the earlier
*questions* and never an earlier answer, so every answer is grounded in a fresh
search of the archive rather than in a transcript, and there is no field a forged
answer could arrive in. The fourth question starts a clean series, and closing
the panel drops the series entirely.

### The card

Image (or a designed fallback), publisher, publication time, title,
description, theme. Nothing else. The fallback for an item without an image is
typographic and generated in the component — never a grey placeholder box.

## Data

One file per day, committed to the repository:

```
content/days/2026-08-08.json
public/img/{itemId}.webp
```

```ts
type Theme = 'ai' | 'world' | 'games' | 'science' | 'culture'

type Edition = {
  date: string          // YYYY-MM-DD
  generatedAt: string   // ISO 8601
  summary: string       // the day in one or two sentences, written by the model
  targetCount: number   // 30 — a shorter edition is legible, not inferred
  items: Item[]         // up to targetCount, ordered by rank
}

type Item = {
  id: string            // stable hash of the canonical URL
  rank: number          // 1..30 — relevance, decided by the model
  title: string
  description: string   // one editorial line, written by the model
  url: string           // the original article
  image: string | null  // path under /img, or null
  theme: Theme          // exactly one, chosen by the model from the source's allowlist
  publisher: string     // the outlet that published it — the card's byline
  feed: { name: string; kind: 'blog' | 'press' | 'paper' | 'video' | 'forum' }
  publishedAt: string   // ISO 8601
  topics: string[]
}
```

`rank` is persisted rather than derived. Order is part of the edition: reopening
a past day must show it exactly as it was published.

`theme` is the model's only decision about an item's identity, and it is bounded:
each source declares the themes an item from it may carry, and validation rejects
a curation that files an item outside that set. Editions published before themes
existed carry no `theme` and a `targetCount` of 20. **They are not backfilled** —
an edition is a record of what was published, not of what the schema became — so
anything reading the archive must tolerate the field's absence.

`publisher` is derived from `url`, not taken from the feed, because a feed is a
discovery channel and not a masthead — Hacker News links to Reuters, and "BBC
World" is a section — so bylining an item with its feed tells the reader the tap
will land somewhere it will not. `feed` records which source found the item, the
one piece of provenance the URL cannot recover, and remains what dedupe priority
keys on.

## Sources

All free, none requiring an API key. Verified reachable on 2026-08-08.

Each source declares the themes an item from it may be filed under — an
allowlist, not a label. Tight where the source is narrow, wide only where it
honestly is: The Guardian's AI section runs regulation stories that are world
news by any reading, and Hacker News carries whatever was submitted.

| Source | Endpoint | Kind | Themes |
|---|---|---|---|
| OpenAI | `openai.com/news/rss.xml` | press | ai |
| Google DeepMind | `deepmind.google/blog/rss.xml` | blog | ai |
| Hugging Face | `huggingface.co/blog/feed.xml` | blog | ai |
| Simon Willison | `simonwillison.net/atom/everything/` | blog | ai |
| TechCrunch AI | `techcrunch.com/category/artificial-intelligence/feed/` | press | ai |
| Ars Technica AI | `arstechnica.com/ai/feed/` | press | ai |
| MIT Technology Review | `technologyreview.com/topic/artificial-intelligence/feed` | press | ai |
| The Guardian AI | `theguardian.com/technology/artificialintelligenceai/rss` | press | ai, world |
| BBC World | `feeds.bbci.co.uk/news/world/rss.xml` | press | world |
| NPR World | `feeds.npr.org/1004/rss.xml` | press | world |
| Eurogamer | `eurogamer.net/feed` | press | games |
| GamesIndustry.biz | `gamesindustry.biz/feed` | press | games |
| Ars Technica | `arstechnica.com/science/feed/` | press | science |
| Scientific American | `scientificamerican.com/platform/syndication/rss/` | press | science |
| Quanta Magazine | `quantamagazine.org/feed/` | press | science |
| Polygon | `polygon.com/rss/index.xml` | press | culture |
| Variety | `variety.com/feed/` | press | culture |
| Hacker News | `hn.algolia.com/api/v1/search_by_date` | forum | ai, games, science |

Hacker News is queried once per term, and the terms cover all three themes it is
allowed. A query list that only asked about AI would make its games and science
permissions dead letters — permitted to supply them, never carrying a candidate
for either, and nothing in the output would say so.

Anthropic publishes no RSS feed; its announcements arrive through Hacker News
and Simon Willison, both of which cover them closely. Reuters returns 401 to
automated clients and is not used.

arXiv and YouTube are deliberately absent. arXiv publishes hundreds of cs.AI
papers a day — high volume, low interest for a daily reader, and enough text to
swamp the curation call. YouTube needs a chosen set of channels. Both are
candidates for their own source kind later.

## Pipeline

Runs daily at 09:00 via GitHub Actions.

1. **Fetch** all sources in parallel. Three parsers total — RSS 2.0, Atom, and
   JSON — not one per source.
2. **Window and exclude.** Everything published in the last 48 hours, minus
   everything already published in a previous edition. A 24-hour window yields
   about fifty items, which is too thin to curate thirty from honestly; 48 hours
   roughly doubles it, and the archive supplies the exclusion list, so no item
   ever runs twice. There is no per-theme intake cap: the theme maxima below cap
   the *edition*, where the model's judgment is available, rather than the pool,
   where only recency or source priority would decide what it never sees.
3. **Deduplicate.** Canonical URL first, then title overlap above a high
   threshold. That threshold was measured against real headline pairs rather than
   guessed: below it, "OpenAI raises $10B" and "OpenAI raises $40B" merge into
   one story, which silently deletes news. The cost of setting it high is that a
   genuine cross-outlet rewrite of the same story is not caught the same day —
   curation usually declines to rank both, and the archive's title exclusion
   catches it the next day. Catching it at collection time needs embeddings, not
   a lower number.
4. **Resolve images.** `media:content` → `media:thumbnail` → `enclosure` →
   `og:image` from the article page → `null`. Downloaded, resized, written to
   `public/img/`.
5. **Curate.** One model call over the surviving set. Structured output: up to
   thirty ids ranked in one global sequence, one theme each, one editorial line
   each, topics, and the day's summary line. Each theme has a band — minima
   guarantee presence, maxima carry the reader's priority:

   | Theme | Min | Max |
   |---|---|---|
   | ai | 4 | 14 |
   | world | 2 | 8 |
   | games | 2 | 6 |
   | science | 1 | 5 |
   | culture | 1 | 4 |

   The maxima are what stop one desk dominating the day: BBC World alone
   publishes around nineteen items a day. The minima sum to ten and the maxima to
   thirty-seven, which brackets the twelve-item floor and the thirty-item target;
   a unit test asserts that, because bands whose minima summed above the target
   would abort every run forever with a reason that never mentions the config.
6. **Validate.** Every returned id exists in the input. No more than thirty, none
   below the floor. Ranks are exactly 1..N — unique *and* contiguous, since a
   gap is either an item dropped after ranking or a ranking never made. Every
   theme is one of the five and inside its source's allowlist, and every
   per-theme count is inside its band, with the minimum softened to what the
   candidates could actually supply. No empty fields. No URL absent from the
   fetched set. Failure aborts the run without writing.
7. **Commit and push.** Vercel builds from the push.

If fewer than thirty candidates survive, the edition publishes with what it has
and records the shortfall. A thin news day is not a failure, and neither is a day
with nothing to say about one theme.

If the model call cannot run — quota exhausted, provider down — the job fails
without writing, and the last successful edition remains live.

**The site rebuilds every morning whether or not an edition was written.** That
sounds redundant and is not: the page marks a stale edition by comparing its date
to today's, and on a prerendered route today is frozen at build time. If the only
trigger for a build were the commit above, then in the exact case the stale
notice exists for — the run failed, nothing was written — nothing would rebuild,
and the page would still believe it was built today. The notice would be
unreachable in production, permanently.

## AI

Two jobs, deliberately narrow.

**Curation** (build time, once per day). The model reads titles, sources,
summaries, allowed themes and timestamps, then selects and ranks thirty items,
files each under one theme and writes one line for each. It never writes article
bodies and never invents an item: its output is a set of ids drawn from the
input, with themes drawn from each item's allowlist, both enforced by validation.

**Search** (`POST /api/ask`, runtime). A local MiniSearch index over every
committed edition, built once per instance and exposed to the model as a
`searchNews` tool. The model returns sentences carrying item ids, never prose
with markers, and every id is checked against what the tool actually returned on
that call. An answer carrying one id from anywhere else is discarded whole rather
than repaired, because a complete-looking answer minus one citation reads as a
complete answer. Each surviving sentence cites its items with the date they ran.
When the searches turn up nothing, the answer says so and stops.

Cost is bounded structurally rather than by instruction: the tool returns at most
eight items per search, the tool loop stops after four steps, a series carries at
most three questions and never an answer, and the route refuses more than ten
questions per ten minutes from one caller. The model is Sonnet 5 at medium
effort — the dial this turns down is effort, not model size.

**The rate limit is a speed bump, not a security control**, and this says so
because a spec that overclaims a protection is worse than one that omits it. The
caller is identified by a request header, so anyone willing to send a different
value gets a fresh allowance. The counters live in one instance's memory, so a
second instance counts from zero and a recycled instance forgets what it held. It
stops a runaway loop and casual cost, which is what it was added for; anything
that has to actually hold belongs at the platform edge, where the connection's
real address is known.

## Design

Dark and light from the first version, not a later toggle. The design system is
produced before implementation and documented in `docs/design-system.md`, with
every value traceable to the approved screens.

Ten states are designed, not improvised: full edition, yesterday's edition
(pipeline failed), an edition missing one or more themes, item without an image,
search idle, search running, search answering with citations, search with no
result, a question after a question, archive navigation.

The missing-theme state is the one most easily got wrong. A theme with no supply
is a correct edition, so the filter row is built from the themes present in the
day's items — a chip that filters to zero cards must not be renderable.

## Non-goals

- User accounts, personalization, notifications
- Comments, reactions, sharing
- Full article text, offline reading, a reader mode
- Real-time updates — one edition per day is the product
- Conversation history in search beyond a series of three questions: no stored
  session, no transcript that outlives the panel, and no answer ever sent back

## Scalability and known debt

Sentinel is built for a single reader. These are deliberate trade-offs, recorded
so they are decisions rather than oversights.

| Choice | Ceiling | What replaces it |
|---|---|---|
| Images committed to the repository | ~1 MB/day; painful past a few months | Object storage (S3/R2) with a CDN in front |
| Editions as JSON files in git | Fine into the thousands; slow clones eventually | Any database, or the same files behind object storage |
| Search index built in memory at cold start | Fine at 30 items/day for years | A hosted index once the corpus grows large |
| Static build per push | One build per day is trivial | Incremental Static Regeneration, or serving the archive dynamically |
| Curation as one model call | Bounded by the context window | Cluster first, then curate per cluster |

None of these are load-bearing for the current scale, and each has an obvious
replacement. The cheapest option was chosen on purpose.

## Stack

Next.js 16 (App Router, static by default), React 19, TypeScript, plain CSS in
one stylesheet, Vercel AI SDK, MiniSearch, deployed on Vercel. GitHub Actions
runs the daily pipeline. One secret: the model API key.

There is no CSS framework. The design system is eight colours, two typefaces and
one interaction, and `app/globals.css` is the design reference's own stylesheet
ported with its class names intact — so the implementation and the visual gate's
reference are the same document in two places rather than two dialects of one
design.

The site has exactly one runtime route, `POST /api/ask`. Everything else is
generated at build time from files in this repository.
