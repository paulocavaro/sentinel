# Phase 01 — Ingest pipeline

Collect, curate and publish one edition per day. No UI in this phase.

## Problem

Sentinel promises twenty items every morning, chosen and ranked by relevance,
committed to the repository as a dated file. Nothing produces that file yet.

The naive design — read the feeds once a day, hand everything to a model, take
twenty — does not survive contact with the real volume.

## What the volume actually is

Measured 2026-08-08 across the ten feeds:

| Window | Items |
|---|---|
| 24h | 43 (19 of them BBC World) |
| 72h | 121 |
| Hacker News, >10 points | ~12 in 24h |

So a 24-hour pool is roughly fifty items, of which under thirty are AI. Picking
twenty from that is not curation — it is taking most of what exists, and on a
thin day it forces filler into an edition whose whole premise is that every item
earned its place. (The measurement fell on a Saturday; weekdays run higher, which
narrows the problem but does not remove it.)

## Solution

A single script, `pnpm ingest`, run daily by GitHub Actions at 09:00 UTC.

1. **Fetch** eleven sources in parallel — ten RSS/Atom feeds plus Hacker News via
   the Algolia API. Three parsers total (RSS 2.0, Atom, JSON), not one per source.
2. **Window**: everything published in the last 48 hours.
3. **Exclude** every item already published in a previous edition. The archive is
   the exclusion list.
4. **Deduplicate** what remains: canonical URL first (lowercase host, strip
   `utm_*`, drop trailing slash), then normalized-title comparison.
5. **Resolve images**: `media:content` → `media:thumbnail` → `enclosure` →
   `og:image` from the article page → `null`. Downloaded, resized, written to
   `public/img/{itemId}.webp`.
6. **Curate**: one model call over the surviving set. Structured output — up to
   twenty ids ranked by relevance, one editorial line per item, topics, and the
   day's summary line.
7. **Validate**, then commit and push. Vercel builds from the push.

## Key decisions

| Decision | Rationale |
|---|---|
| **48-hour window, minus everything already published** | Doubles the pool to ~100 without breaking the twenty-item promise. The archive gives the exclusion list for free, so nothing appears twice. A 24-hour window would have forced either filler or a broken promise. |
| **World news floored at 3, capped at 6** | BBC World alone publishes ~19 items a day. With no rule it dominates selection and Sentinel becomes a generic news app. AI stays the axis; world enters as context. |
| **Short editions publish, marked** | If fewer than twenty candidates survive, the edition ships with what it has and the data records the shortfall. A thin news day is not a failure, and treating it as one punishes the reader. |
| **A published edition is never silently rewritten** | If today's file exists, the run exits without doing anything. `--force` overrides. An Actions retry must not be able to swap out an edition nobody noticed changing. |
| **arXiv and YouTube excluded from this phase** | arXiv publishes hundreds of cs.AI papers a day, with low interest for a daily reader, and would swamp the curation call. YouTube needs channel ids that have not been chosen. Both can return as their own phase. |
| **Curation runs on `claude-sonnet-5`** | The task is judgment over ~100 headlines with structured output. Opus is overpriced for it; Haiku ranks poorly. Cost is cents per day either way. |
| **09:00 UTC (06:00 BRT)** | The edition is ready before the reader wakes, and it captures the US overnight — when OpenAI, Anthropic and the American press publish. Actions cron can drift ~20 minutes at peak; nothing here depends on the minute. |
| **Vercel connected in this phase, not at the end** | Being live is on the never-cut list. Deferring deployment to a later phase bets that time is left over. |

## Validation — what aborts the run

The run writes nothing and exits non-zero if any of these fail:

- Any returned id is absent from the input set (the model invented an item)
- More than twenty items, or fewer than the configured floor
- World-kind items outside the 3–6 band
- Any item missing a title, url, description or `rank`
- Any URL not present in the fetched set
- Duplicate `rank` values

A failed run leaves the previous edition live. That is the intended outcome, not
a degraded one.

## Data

`Edition` gains `targetCount: number` (always 20) so a short edition is legible
in the data rather than inferred from `items.length`. Everything else follows
`docs/spec.md`.

## Technical choices

- `tsx` to run the TypeScript script under Actions
- `fast-xml-parser` for RSS and Atom
- `sharp` for image resizing
- Vercel AI SDK (`ai` + `@ai-sdk/anthropic`) with `generateObject` and a Zod
  schema, so curation output is validated at the call boundary
- `ANTHROPIC_API_KEY` as the single GitHub Actions secret

## Out of scope

- Any UI, route or component — phase 02
- Conversational search — phase 03
- arXiv, YouTube, and any source beyond the eleven listed
- Backfilling past editions: the archive starts the day the pipeline starts
- Clustering, topic pages, per-source pages, notifications
