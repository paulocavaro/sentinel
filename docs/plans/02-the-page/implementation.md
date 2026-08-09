# Phase 02 — The page Implementation Plan

> **dev-loop plan.** Executed by /execute-phase: fresh maker per task, automated
> gate per task, atomic commit per task, loop-verify per completed screen.

**Goal:** the site renders the editions the pipeline has been publishing, at the
approved design, on three static routes.

**Architecture:** server components read `content/days/*.json` at build time
through one module, `lib/edition.ts`. Everything below it is presentation. The
stylesheet is the design reference's CSS, ported with its class names intact, so
the implementation and the visual gate's reference are the same document in two
places rather than two dialects of one design.

**Design doc:** [`design.md`](./design.md)

## Global Constraints

- Gate order is fixed: `pnpm build && pnpm typecheck && pnpm lint && pnpm test`.
- **Read `node_modules/next/dist/docs/` before writing anything Next-specific.**
  Next 16 differs from recalled APIs. `params` and `searchParams` are Promises;
  synchronous access was removed. `PageProps<'/day/[date]'>` only exists after a
  build, which is why the gate runs build before typecheck.
- **Never `dangerouslySetInnerHTML`.** The small-caps and lead-in transforms
  operate on model-authored and publisher-authored text. In the generator they
  build HTML strings because it writes a file; in React they must be tokenizers
  returning nodes. This is the single most likely way untrusted text becomes
  markup in this codebase.
- Class names in the stylesheet must match the references exactly. That was the
  whole argument for removing Tailwind.
- No new dependency without saying why. `design-system.md`'s refusals stand.
- Nothing in `content/days/` or `lib/ingest/` is touched, except `config.ts`
  gaining one constant in Task 4.

---

### Task 1a: Strip Tailwind, port both stylesheets

**Files:**
- Modify: `app/globals.css`, `app/page.tsx`, `package.json`, `pnpm-lock.yaml`
- Delete: `postcss.config.mjs`, `public/next.svg`, `public/vercel.svg`,
  `public/window.svg`, `public/file.svg`, `public/globe.svg`

- [ ] **Step 1 — Remove.** `pnpm remove tailwindcss @tailwindcss/postcss`, delete
  `postcss.config.mjs`, delete the scaffold's SVGs. Reduce `app/page.tsx` to a
  minimal valid placeholder with **no `next/image` import** — it is refused by
  `design-system.md`, and an unused import fails lint once the body is gutted.
  Commit the regenerated lockfile: `daily.yml` runs `--frozen-lockfile`, so a
  `package.json` without it breaks the pipeline, not the site.
- [ ] **Step 2 — Port both style blocks.** `app/globals.css` becomes the `<style>`
  block from `design-refs/home.html` **plus** the promoted-components block at
  the bottom of `design-refs/states.html`. The stale banner, the ask answer and
  the citation only exist in the second file; porting only the first leaves
  Task 5's banner with no CSS. Drop `.toggle` (see Task 1c). Keep every comment.
- [ ] **Step 3 — Update `docs/spec.md`**, which still names Tailwind 4 in its
  stack section and is fed to the visual gate as a spec doc.
- [ ] **Step 4 — Gate**
- [ ] **Step 5 — Commit:** `feat(02): the stylesheet`

---

### Task 1b: The shell, the type, and the viewport

**Files:** modify `app/layout.tsx`; create `app/not-found.tsx`, `app/error.tsx`

- [ ] **Step 1 — Fonts.** `next/font/google`: `Spectral` weights 400 and 600,
  styles normal and italic; `IBM_Plex_Mono` weights 400 and 500. Spectral is not
  a variable font, so the request loads all four combinations — say so in a
  comment rather than leaving it to be discovered. Expose them as CSS variables
  and introduce `--face-text` / `--face-machine` in the stylesheet **and in
  `design-refs/home.html`**, so the two documents stay identical. This is a
  refactor of the reference, not only of the port.
- [ ] **Step 2 — Layout.** Drop `Geist`, the `@theme` block, and the
  `h-full antialiased` / `min-h-full flex flex-col` utilities — nothing in the
  design needs full height or flex, and the stylesheet already sets font
  smoothing. Real metadata: a title template, the spec's first line as
  description, `metadataBase`, and an icon.
- [ ] **Step 3 — The viewport export, not `metadata.themeColor`.**
  `Metadata.themeColor` is deprecated in Next 16, still typechecks, and is
  **silently not emitted** — it only logs a build warning. The gate would be
  green and the tags absent, which is exactly the failure the tags prevent. Use
  `export const viewport: Viewport = { themeColor: [...] }` with the two
  `prefers-color-scheme` entries.
- [ ] **Step 4 — `not-found.tsx` and `error.tsx`**, in the product's voice. The
  end-of-phase checklist requires an error state on every surface and no other
  task produces one.
- [ ] **Step 5 — Gate**
- [ ] **Step 6 — Commit:** `feat(02): the shell`

---

### Task 1c: Make the references verifiable

**Files:** modify `design-refs/build-home.mjs`, `design-refs/build-states.mjs`;
regenerate both HTML files; create `design-refs/day.html`

> Three defects in the references would each produce a guaranteed false failure
> in the visual gate. Fix the reference before building against it.

- [ ] **Step 1 — Drop `.toggle` from the generators.** Both references render a
  fixed *Light / Dark* button top-right that the app will not have, so every
  capture differs in that corner. The browse engine emulates
  `prefers-color-scheme`; the button was only ever for a human opening the file.
- [ ] **Step 2 — Add the rules the references promise and do not contain:**
  - `.item:not(:has(.plate)) .head` — the headline promotion for an item with no
    photograph, per tier. `states.html` state 04 fakes it with an inline style,
    so the shipped card would be the card with a hole in it that
    `design-system.md` forbids.
  - `.lead:not(:has(.plate)) .body { grid-column: 1 / -1 }` — no edition has a
    lead without a photograph yet, and the day one arrives the front page
    collapses into a six-of-sixteen strip.
  - `.chip[aria-current]` — the selected state the plan requires and the
    stylesheet does not define.
- [ ] **Step 3 — Fix `.day.is-off`.** `opacity: 0.45` on `--machine` lands near
  2.2:1, below AA, and violates the system's own written invariant that the
  machine layer recedes by size, tracking and case and **never** by opacity.
  Recede the unavailable date by dropping its arrow and underline instead.
- [ ] **Step 4 — Generate `design-refs/day.html`** from `2026-08-08.json`. A
  pre-theme, twenty-item, six-images-missing edition has no reference today, so
  `day` would be judged against a thirty-item themed page and fail while
  correct. A second file generated by the same script is not a copy that drifts.
- [ ] **Step 5 — Update `.loop/config.md`:** `day` points at `/day/2026-08-08`
  and `design-refs/day.html`; `states` gains the route `/states`.
- [ ] **Step 6 — Commit:** `fix(02): make the design references verifiable`

---

### Task 2: Dates and typesetting

**Files:** create `lib/date.ts`, `lib/date.test.ts`, `lib/typeset.tsx`, `lib/typeset.test.tsx`

- [ ] **Step 1 — Failing tests.**
  - `lib/date.ts`: `editionDate('2026-08-09')` must give `Sunday 9 August` **in
    every timezone**. Verified on this machine: without the fix,
    `America/Recife` returns `Saturday 8 August` — a day wrong. The generator
    already encodes the answer (parse at noon UTC, format `en-GB`); it was never
    carried into the app. Test under `TZ=America/Los_Angeles` and `TZ=Asia/Tokyo`.
    Also: the year appears when the edition is not from the current year.
  - `lib/typeset.tsx`: `smallCaps` wraps two-to-four-letter uppercase runs and
    **returns React nodes, never a string**; `leadIn` bolds the first two words;
    both leave the rest untouched; neither is applied to a byline.
- [ ] **Step 2 — Run, confirm failure**
- [ ] **Step 3 — Implement**
- [ ] **Step 4 — Gate**
- [ ] **Step 5 — Commit:** `feat(02): dates and typesetting`

---

### Task 3: The edition reader

**Files:** create `lib/edition.ts`, `lib/edition.test.ts`

**Interfaces:** `listEditionDates()`, `readEdition(date)`,
`readLatestEdition(): Promise<Edition | null>`, `themesOf(edition)`,
`isThin(edition)`

- [ ] **Step 1 — Failing test**, reading from a temp directory so no test depends
  on the committed editions. Cover: dates newest first; a corrupt file skipped;
  `readEdition` null for a missing date; **`themesOf` empty for an edition whose
  items carry no `theme`** — the 8 August edition predates the field and must
  render ungrouped; `themesOf` returns the canonical order, not order of
  appearance; **`isThin` reads `edition.targetCount`, never `TARGET_COUNT`** —
  the 8 August edition is a complete twenty-item edition with `targetCount: 20`,
  and a maker importing the constant would label it a thin day.
- [ ] **Step 2 — Run, confirm failure**
- [ ] **Step 3 — Implement.** The reader's item type makes `theme` optional; a
  type that lies about the archive pushes the failure into a component.
  `readLatestEdition` returns `Edition | null` — an empty `content/days` is
  reachable on a fresh clone. Wrap the readers in `React.cache`: `generateMetadata`
  and the page each call them, and non-`fetch` reads are not memoised.
- [ ] **Step 4 — Gate**
- [ ] **Step 5 — Commit:** `feat(02): the edition reader`

---

### Task 4: The item, in three tiers

**Files:** create `app/components/Item.tsx`, `app/components/Plate.tsx`;
modify `lib/ingest/config.ts`

- [ ] **Step 1 — Implement.** The markup from `design-refs/home.html`, verbatim
  in structure. The brief tier is `h3.head` (inline) + `span.dash` + **`span.run`**
  — the reference class is `run`; `dek-run` does not exist anywhere.
  - Small caps on titles and descriptions. **Never the byline**, which is already
    uppercased by `text-transform`; small caps on top renders `CNN` at x-height
    beside a full-size `TECHCRUNCH`. That regression is in this repo's history.
  - `Plate` renders nothing when `image` is null. Task 1c added the CSS that
    gives the headline the space.
  - The link carries `target="_blank" rel="noopener noreferrer"` and an `sr-only`
    "(opens at host)" **inside** the anchor, as the reference does. The
    accessible name is title-plus-destination; what must be excluded is the
    description.
  - Add `CLOSING_TIME = '09:23'` to `lib/ingest/config.ts`, beside the cron it
    mirrors. The reference prints it as a constant and no field carries it;
    putting it anywhere else lets the two drift.
- [ ] **Step 2 — Gate**
- [ ] **Step 3 — Commit:** `feat(02): the item`

---

### Task 5: The masthead, the edition bar, the banner

**Files:** create `app/components/Masthead.tsx`, `EditionBar.tsx`, `StaleBanner.tsx`

- [ ] **Step 1 — Implement.** `Masthead`: wordmark, `h1.editiondate` with the
  weekday in its own span, `p.manifest`, and `p.promise` with the count, the
  closing time, and `· a thin day` when thin.
  - The thin-day closing sentence spells its count in words — *"Seventeen items
    — the window was thin"* — per `states.html` 02. A small number-to-words
    helper lives in `lib/date.ts`'s neighbourhood or inline; it is not worth a
    dependency.
  - `EditionBar`: the dates themselves, never Previous and Next. **Prev and next
    are the nearest *existing* editions, not the calendar neighbours.** The
    reference computes ±1 day unconditionally, which on a pipeline designed to
    miss some days sends half the links to `NoEdition`. An unavailable direction
    renders without its arrow and underline, `aria-disabled` on an anchor with no
    `href` — `aria-disabled` on a `<span>` announces nothing.
  - `StaleBanner` renders when the latest edition is not today's.
- [ ] **Step 2 — Gate**
- [ ] **Step 3 — Commit:** `feat(02): the masthead`

---

### Task 6: Sections and grouping

**Files:** create `lib/themes.ts`, `lib/themes.test.ts`, `app/components/Edition.tsx`

- [ ] **Step 1 — Failing test.** Grouping preserves the canonical theme order;
  a theme with no items produces no group; **an edition whose items have no
  `theme` produces one unlabelled group**; the lead is excluded from its section.
  `THEME_LABELS` is exactly `Artificial intelligence`, `The world`, `Games`,
  `Science`, `Culture` — the reference's strings, not `AI` or `World`.
- [ ] **Step 2 — Run, confirm failure**
- [ ] **Step 3 — Implement.** `Edition` renders the lead, then a section per
  theme with `h2.section-name` and a `div.features` of up to four, then
  `div.briefs`. Sections keep their `id` and `aria-labelledby` — the no-script
  path depends on the ids.
- [ ] **Step 4 — Look at the ungrouped case.** With no themes the 8 August
  edition is one lead, four features and **fifteen briefs under a single
  hairline**, with no `--rule-strong` anywhere — which is the twenty-identical-
  bands failure the rule ladder exists to prevent. Decide what breaks that run:
  the honest options are a plain rule every N items, or accepting it because the
  archive holds exactly one such edition and will never hold another.
- [ ] **Step 5 — Gate**
- [ ] **Step 6 — Commit:** `feat(02): sections`

---

### Task 7: The theme filter

**Files:** create `app/components/ThemeFilter.tsx`

> **The plan previously asked for something incoherent.** It wanted a real
> filter, a shareable URL, working anchors without JavaScript, a re-tier to
> compact, and exactly one client component. The compact tier is a different DOM
> — a brief has no plate, an inline headline, a dash and a `span.run`, and no
> lead-in bold — so re-tiering client-side would make every item a client
> component, and re-tiering server-side would make every route dynamic, breaking
> the spec's "exactly one runtime route".
>
> What is kept: filtering is a **class on `<main>`**, so the page stays static
> and server-rendered, and the compact view is achieved by CSS — the plates hide,
> the grid collapses to one column, the headline drops to the brief size. It is
> a compact view rather than the brief markup. That is the deviation, and it is
> the only one that satisfies everything else.

- [ ] **Step 1 — Implement.**
  - The chips are `<a href="?theme=ai#ai">`: with no script they scroll to the
    section, with script they filter. One href, both behaviours, degrades.
  - The active theme is **derived from the URL, never mirrored into state**, or
    the back button leaves the list filtered while the URL says otherwise.
  - **Clamp the parameter.** `?theme=sports`, `?theme=` , a repeated
    `?theme=ai&theme=world` (which arrives as an array), and `?theme=games` on
    the pre-theme edition must all render unfiltered. Unclamped, the URL is the
    door the derived chip row was locked to prevent, and the page shows a
    masthead, zero items and an end mark claiming thirty.
  - Wrap in `<Suspense>`. `useSearchParams` outside Suspense is a **build error**
    in Next 16, not a bailout — and `pnpm dev` renders on demand, so it looks
    fine locally and fails the gate. The fallback renders the unfiltered chip
    row, not nothing, or every load flashes a missing nav band.
  - Focus stays on the activated chip; the results container takes `tabIndex={-1}`
    and an id.
  - An `aria-live="polite"` node beside the chips: *"Showing 8 items in
    Artificial intelligence."* Without it the list is replaced and a screen
    reader is told nothing.
- [ ] **Step 2 — Gate**
- [ ] **Step 3 — Commit:** `feat(02): the theme filter`

---

### Task 8: The ask panel

**Files:** create `app/components/AskPanel.tsx`, `app/components/AskButton.tsx`

- [ ] **Step 1 — Implement.** A `<dialog>` opened with `showModal()` from the
  round floating button, which carries `aria-haspopup="dialog"` and
  `aria-controls`.
  - **`display` must stay scoped to `[open]`.** A bare `display: flex` overrides
    the browser's `display: none` for the closed state, and the panel is then
    open from page load and can never close. That bug is in this repo's history
    and the stylesheet already carries the fix.
  - The field is disabled and the panel says the search arrives next phase. It
    must not accept a question it cannot answer.
- [ ] **Step 2 — Gate**
- [ ] **Step 3 — Commit:** `feat(02): the ask panel`

---

### Task 9: The edition page, and the home route

**Files:** create `app/components/EditionPage.tsx`; modify `app/page.tsx`

**Screens:** home (web)

- [ ] **Step 1 — Implement.** `EditionPage` composes banner, masthead, edition
  bar, filter, edition, close block and ask button. **Both routes use it** — the
  previous plan had the day route "render exactly like the home route" with no
  shared component, which guarantees a copy that drifts on the first change.
  - The close mark carries `items.length`, never a constant.
  - `/` reads the latest edition; a null edition renders `NoEdition`.
- [ ] **Step 2 — Gate**
- [ ] **Step 3 — Look at it** at 390px and 1440px, both themes, against
  `design-refs/home.html`.
- [ ] **Step 4 — Commit:** `feat(02): the home route`

---

### Task 10: The archive

**Files:** create `app/day/[date]/page.tsx`, `app/archive/page.tsx`,
`app/components/NoEdition.tsx`; modify `next.config.ts`

**Screens:** day (web)

- [ ] **Step 1 — Implement.** `generateStaticParams` over the edition dates.
  - **Validate the segment** — `/^\d{4}-\d{2}-\d{2}$/`, a real calendar date, and
    inside the archive's range. `dynamicParams` defaults to true, so without
    this `/day/banana` renders a server component at request time for an
    unbounded set of URLs. Decide `dynamicParams` explicitly and write down why.
  - **`outputFileTracingIncludes: { '/**': ['./content/days/**'] }`** in
    `next.config.ts`. `fs.readFile` on a computed path is not statically
    analysable, so the JSON is not traced into any function bundle; the moment
    one route renders at request time it is `ENOENT` in production, with a
    perfectly green build and dev server.
  - `NoEdition` is **not a 404**: a real day was asked for by name.
  - `/archive` lists every date by month, plain links.
- [ ] **Step 2 — Gate**
- [ ] **Step 3 — Look at `/day/2026-08-08`**, the pre-theme shape everything
  above was built to tolerate, against `design-refs/day.html`.
- [ ] **Step 4 — Commit:** `feat(02): the archive`

---

### Task 11: Make the stale state reachable

**Files:** modify `.github/workflows/daily.yml`; modify `docs/spec.md`

> **The reason this task exists.** The design said: render the newest edition,
> compare its date to today, and the banner falls out of the data — "one code
> path, and the state cannot be forgotten." On a prerendered route `today` is
> frozen at **build** time, and the only thing that triggers a build is the
> ingest pushing a new edition, which only happens when the job **succeeds**. So
> in the exact scenario the banner exists for, nothing is pushed, nothing is
> rebuilt, and the page still believes it was built today. `isStale` is `false`
> in production, permanently. The design's own sentence about the state being
> impossible to forget is what made it impossible to reach.

- [ ] **Step 1 — Implement.** A Vercel Deploy Hook called from `daily.yml` under
  `if: always()`, so the site rebuilds whether or not an edition was written.
  Store the hook URL as a repository secret. **(human — creating the hook needs
  your Vercel account)**
- [ ] **Step 2 — Prove it.** Dispatch the workflow with an invalid key, confirm
  no commit lands, confirm a Vercel deployment runs anyway, and confirm the
  stale banner appears on the deployed site.
- [ ] **Step 3 — Record it in `docs/spec.md`**: the site rebuilds daily
  regardless of ingest outcome, and why.
- [ ] **Step 4 — Commit:** `feat(02): rebuild daily so a stale edition can say so`

---

### Task 12: The states page

**Files:** create `app/states/page.tsx`, `app/states/fixtures.ts`

**Screens:** states (web)

- [ ] **Step 1 — Implement.** `/states` renders the six conditions from the real
  components, matching `design-refs/states.html` — including its catalogue
  chrome (`.cat`, `.state`, `.state-head`, `.state-n`, `.state-title`,
  `.state-why`, `.state-frame`) and the exact prose of the six `state-why`
  paragraphs, or the gate reports a divergence on text alone.
  - The reference's state 05 is **Running** and **Answered**, not idle. Those are
    phase-03 behaviours with no component behind them yet, so render them as the
    static markup the reference shows, labelled as belonging to the next phase.
  - **Neither committed edition is thin**, so that fixture is necessarily
    synthetic — derived by truncating a real edition, not invented from nothing.
- [ ] **Step 2 — Gate**
- [ ] **Step 3 — Commit:** `feat(02): the states page`

---

## Failure modes

| Failure | Handled by |
|---|---|
| Stale banner unreachable in production | **T11** |
| `themeColor` silently not emitted | T1b step 3 |
| `useSearchParams` failing the build but not dev | T7 step 1 |
| `content/days` missing from the deployed bundle | T10 step 1 |
| `/day/banana` rendering at request time | T10 step 1 |
| Date off by one outside UTC | T2 |
| A complete 20-item edition labelled thin | T3 step 1 |
| Edition with no `theme` | T3, T6, T10 step 3 |
| `?theme=` naming a theme not in the edition | T7 step 1 |
| Byline rendered at x-height | T4 step 1 |
| Panel open from page load | T8 step 1 |
| Lead with no photograph collapsing the grid | T1c step 2 |
| Card with a hole where the picture was | T1c step 2 |
| Archive links pointing at days with no edition | T5 step 1 |
| `day` gate failing on a correct page | T1c steps 4–5 |
| Untrusted text reaching `dangerouslySetInnerHTML` | Global Constraints, T2 |

## Out of scope

The conversational search and everything phase 03, any pipeline change beyond
one constant and the deploy hook, backfilling `theme`, and everything
`design-system.md` refuses.

## Definition of done

- `/` matches `design-refs/home.html` at 390px and 1440px, judged by the gate
- `/day/2026-08-08` matches `design-refs/day.html`
- A filtered view survives a reload and the back button, and an unknown theme
  renders unfiltered
- The ask panel opens, closes on Escape, and accepts nothing
- `/states` renders all six from the real components
- **A failed ingest produces a rebuild and a visible stale banner**
- The gate is green
