# Sentinel — Product Spec

A daily edition of AI and world news. Every morning a pipeline reads thirteen
sources, a model picks the twenty items that matter and ranks them, and the
result is committed to this repository as a dated JSON file. The site is static
and serves the day.

Twenty items. Then the day ends.

## Principles

**The day ends.** There is no infinite scroll, no "load more", no algorithmic
tail. An edition has twenty items and a bottom. Finishing it is possible, and
that is the point.

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
| `/` | Today's edition: the day in one line, then twenty cards. One card per row on mobile. Tapping a card opens the original article in a new tab. |
| `/day/[date]` | The archive. Same layout, another date, with navigation between days. |
| `/ask` | Conversational search across every edition. Answers cite the item and say which day it ran. No conversation history — each question starts clean. |

Whether `/ask` is a full screen or a launcher pinned to the corner is a design
decision, resolved in the design phase rather than here.

### The card

Image (or a designed fallback), source name, publication time, title,
description. Nothing else. The fallback for an item without an image is
typographic and generated in the component — never a grey placeholder box.

## Data

One file per day, committed to the repository:

```
content/days/2026-08-08.json
public/img/{itemId}.webp
```

```ts
type Edition = {
  date: string          // YYYY-MM-DD
  generatedAt: string   // ISO 8601
  summary: string       // the day in one or two sentences, written by the model
  items: Item[]         // exactly 20, ordered by rank
}

type Item = {
  id: string            // stable hash of the canonical URL
  rank: number          // 1..20 — relevance, decided by the model
  title: string
  description: string   // one editorial line, written by the model
  url: string           // the original article
  image: string | null  // path under /img, or null
  source: { name: string; kind: 'blog' | 'press' | 'paper' | 'video' | 'forum' }
  publishedAt: string   // ISO 8601
  topics: string[]
}
```

`rank` is persisted rather than derived. Order is part of the edition: reopening
a past day must show it exactly as it was published.

## Sources

All free, none requiring an API key. Verified reachable on 2026-08-08.

| Source | Endpoint | Kind |
|---|---|---|
| OpenAI | `openai.com/news/rss.xml` | press |
| Google DeepMind | `deepmind.google/blog/rss.xml` | blog |
| Hugging Face | `huggingface.co/blog/feed.xml` | blog |
| Simon Willison | `simonwillison.net/atom/everything/` | blog |
| TechCrunch AI | `techcrunch.com/category/artificial-intelligence/feed/` | press |
| Ars Technica AI | `arstechnica.com/ai/feed/` | press |
| MIT Technology Review | `technologyreview.com/topic/artificial-intelligence/feed` | press |
| The Guardian AI | `theguardian.com/technology/artificialintelligenceai/rss` | press |
| BBC World | `feeds.bbci.co.uk/news/world/rss.xml` | press |
| NPR World | `feeds.npr.org/1004/rss.xml` | press |
| arXiv cs.AI | `export.arxiv.org/api/query?search_query=cat:cs.AI` | paper |
| Hacker News | `hn.algolia.com/api/v1/search?tags=story` | forum |
| YouTube | `youtube.com/feeds/videos.xml?channel_id=…` | video |

Anthropic publishes no RSS feed; its announcements arrive through Hacker News
and Simon Willison, both of which cover them closely. Reuters returns 401 to
automated clients and is not used.

## Pipeline

Runs daily at 09:00 via GitHub Actions.

1. **Fetch** all sources in parallel. Three parsers total — RSS 2.0, Atom, and
   JSON — not one per source.
2. **Deduplicate.** The same story appears in several outlets. Canonical URL
   first, then title similarity.
3. **Resolve images.** `media:content` → `media:thumbnail` → `enclosure` →
   `og:image` from the article page → `null`. Downloaded, resized, written to
   `public/img/`.
4. **Curate.** One model call over the normalized set (typically 60–120 items).
   Structured output: twenty ids ranked, one editorial line each, topics, and the
   day's summary line.
5. **Validate.** Every returned id exists in the input. Exactly twenty. No empty
   fields. No URL absent from the fetched set. Failure aborts the run without
   writing.
6. **Commit and push.** Vercel builds from the push.

If the model call cannot run — quota exhausted, provider down — the job fails
without writing, and the last successful edition remains live.

## AI

Two jobs, deliberately narrow.

**Curation** (build time, once per day). The model reads titles, sources,
summaries and timestamps, then selects and ranks twenty items and writes one
line for each. It never writes article bodies and never invents an item: its
output is a set of ids drawn from the input, enforced by validation.

**Search** (`/ask`, runtime). A local MiniSearch index over every committed
edition, exposed to the model as a `searchNews` tool. Every claim in an answer
cites an item the tool returned, with the date it ran. When the tool returns
nothing, the answer says so and stops.

Cost is bounded structurally rather than by instruction: the tool returns at
most eight items, there is no conversation history, and search runs on the
smallest model that handles the task.

## Design

Dark and light from the first version, not a later toggle. The design system is
produced before implementation and documented in `docs/design-system.md`, with
every value traceable to the approved screens.

Eight states are designed, not improvised: full edition, yesterday's edition
(pipeline failed), item without an image, search idle, search running, search
answering with citations, search with no result, archive navigation.

## Non-goals

- User accounts, personalization, notifications
- Comments, reactions, sharing
- Full article text, offline reading, a reader mode
- Real-time updates — one edition per day is the product
- Conversation history in search

## Scalability and known debt

Sentinel is built for a single reader. These are deliberate trade-offs, recorded
so they are decisions rather than oversights.

| Choice | Ceiling | What replaces it |
|---|---|---|
| Images committed to the repository | ~1 MB/day; painful past a few months | Object storage (S3/R2) with a CDN in front |
| Editions as JSON files in git | Fine into the thousands; slow clones eventually | Any database, or the same files behind object storage |
| Search index built in memory at cold start | Fine at 20 items/day for years | A hosted index once the corpus grows large |
| Static build per push | One build per day is trivial | Incremental Static Regeneration, or serving the archive dynamically |
| Curation as one model call | Bounded by the context window | Cluster first, then curate per cluster |

None of these are load-bearing for the current scale, and each has an obvious
replacement. The cheapest option was chosen on purpose.

## Stack

Next.js 16 (App Router, static by default), React 19, TypeScript, Tailwind 4,
Vercel AI SDK, MiniSearch, deployed on Vercel. GitHub Actions runs the daily
pipeline. One secret: the model API key.

The site has exactly one runtime route. Everything else is generated at build
time from files in this repository.
