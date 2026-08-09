# Phase 02 — The page

Render the edition. The pipeline has been publishing since phase 01 and nothing
reads it: `app/page.tsx` is still the Next scaffold, and the site in production
is the "Create Next App" starter with two editions sitting unread in the repo.

## Problem

The design exists and is approved — [`design-refs/home.html`](../../../design-refs/home.html),
[`design-refs/states.html`](../../../design-refs/states.html) and
[`docs/design-system.md`](../../design-system.md). It is hand-written CSS
rendering a real edition. What does not exist is the application: routes, a
reader for the archive, a theme filter, and the six states as real screens rather
than a catalogue.

## Solution

Three routes, all static, all built from the JSON files in `content/days/`.

| Route | What it is |
|---|---|
| `/` | The latest edition |
| `/day/[date]` | Any edition, pre-rendered from `generateStaticParams` |
| `/archive` | The list of dates, grouped by month |

The ask panel is a `<dialog>` on every page, not a route. The states are
conditions of these three routes, not screens of their own.

## Key decisions

| Decision | Rationale |
|---|---|
| **Remove Tailwind.** The CSS from the design references becomes the application's CSS. | The system is eight colours, two faces and one interaction. What Tailwind adds here is a second dialect for the same thing, and two dialects drift — the reference is the visual gate's source of truth, so the closer the app is to it literally, the more the gate is worth. `design-system.md` already concluded the block-link pattern cannot be expressed in utilities. |
| **The theme filter is real, not an anchor.** Selecting a theme hides the other sections and shows that one, shareable as `?theme=games`. | This is what was asked for. Anchors are cheaper and script-free, but scrolling to a section is not filtering, and the compact themed view was the point. |
| **The ask panel opens, and says the search is not live yet.** The field is disabled. | The alternative is a field that accepts a question and answers nothing, which is exactly the silence the whole product was designed to avoid. |
| **The home route reads the *latest* edition, not "today's".** | It makes the stale state fall out of the data instead of needing its own branch: render the newest file, compare its date to today's UTC date, and if they differ the banner appears. One code path, and the state cannot be forgotten. |
| **Fonts come from `next/font/google`.** | Self-hosted, so no third-party request on a site whose whole premise is that it is a static record, and no flash of fallback text. This is a deliberate divergence from the reference, which uses a stylesheet link because it is a file opened from disk. |
| **Images stay plain `<img>`.** | The pipeline already resized to 800px and re-encoded to WebP. `next/image` on a static export would need configuration to redo work that is done, and buys nothing. Aspect ratio is held in CSS, so there is no layout shift. |
| **`/archive` is in scope.** | At an edition a day, prev/next alone is 365 taps to reach last January. It is a list of dates and plain links — the cheapest possible version, and it is already in the design as "All editions". |

## The shape problem, and it is real

The two committed editions have different shapes:

| | `2026-08-08` | `2026-08-09` |
|---|---|---|
| items | 20 | 30 |
| `theme` | **absent** | present |

The first edition predates themes. **It must not be backfilled** — an edition is
a record of what was published, and rewriting it would make the archive a
retelling instead of a record.

So the reader tolerates a missing theme, and the page derives its section list
and its filter row from the items actually present. An edition with no themes
renders as one ungrouped list with no filter row, which is a correct rendering of
a correct edition. This also covers the future case the spec already names: a
theme with no supply on a given day simply has no section and no chip.

## States, and where each one lives

All six are conditions of the three routes.

| State | Where it comes from |
|---|---|
| Stale edition | latest edition's date ≠ today's UTC date |
| Thin day | `items.length < targetCount` |
| No edition for a date | `/day/[date]` with no matching file |
| Item with no photograph | `image === null` |
| Ask idle | the panel's only state this phase |
| Ask no-result | phase 03 |

The last two are the panel's, and only the first is buildable now.

## Out of scope

- The conversational search itself — that is phase 03, including the MiniSearch
  index and the model call. This phase builds the panel that will hold it.
- Any change to the pipeline or to the editions.
- Backfilling `theme` into the first edition.
- A theme filter that persists across days, or any preference that outlives a
  page view.
- `next/image`, an icon set, a component library, a density toggle — all refused
  in `design-system.md` and refused again here.

## Definition of done

- `/` renders the latest edition and matches `design-refs/home.html` at 390px
  and 1440px, judged by the visual gate.
- `/day/2026-08-08` renders the pre-theme edition without a filter row and
  without an empty section.
- Selecting a theme filters, and the URL carries it.
- The ask panel opens, traps focus, closes on Escape, and says what it does not
  yet do.
- The stale banner appears when the latest edition is not today's.
- `pnpm build && pnpm typecheck && pnpm lint && pnpm test` is green.
