# Sentinel — design system

> Sentinel has one plane, two faces, eight colours, one interaction and a bottom.
> Anything needing a ninth colour, a third face, a second plane, or a component
> that opens is a change to the product, not to the design system, and goes back
> to [`spec.md`](./spec.md) first.

The visual source of truth is [`design-refs/home.html`](../design-refs/home.html)
and [`design-refs/states.html`](../design-refs/states.html). Both are generated
from a real edition by `design-refs/build-home.mjs` and `build-states.mjs`, so
every screen in this document is the product rendering actual news rather than
placeholder text. Where a value below is traceable, it is traceable to those
files.

## Overview

Sentinel is a daily edition of news, closed at a fixed hour, dated, committed to
a repository and never rewritten. Every item links out to its publisher; there
are no article pages here. The design serves three claims:

1. **This is a record.** It has a date, and the date is the loudest thing on the
   page — the one element guaranteed to differ every morning. A wordmark goes
   stale by the fifth visit; a date cannot.
2. **The day ends.** Thirty items and a bottom you can reach. No infinite scroll,
   no load-more, no algorithmic tail.
3. **It is honest about its limits.** It says which publisher it is sending you
   to, it marks a stale edition as stale, and when asked about something it does
   not hold it says so rather than inventing an answer.

The system was built against measured values from ten editorial products rather
than from taste. Where a decision here disagrees with instinct, the measurement
is given.

## Colour

Eight roles, one layer, no primitive ramp. Every token is a role in the edition
and every role has exactly one job. There is deliberately no `--gray-500`: a
scale beneath these would invite a component to reach past the role and pick a
number.

| Token | Light | Dark | Contrast | Job |
|---|---|---|---|---|
| `--paper` | `#F2F0EB` | `#16171A` | — | The ground. The only background in the product. |
| `--ink` | `#17171A` | `#ECEAE4` | 15.71 / 14.90 | Headlines, the date, the closing sentence |
| `--prose` | `#3D3B36` | `#B8B4AC` | 9.82 / 8.67 | The model's editorial line |
| `--machine` | `#6B6862` | `#8A867E` | 4.88 / 4.94 | Anything the machine stamped: byline, promise, labels |
| `--accent` | `#8A5D0F` | `#B07E28` | 5.05 / 5.00 | The end mark, the stale banner, focus rings. Nothing else. |
| `--read` | `#7C786F` | `#7B776F` | 4.62 / 4.55 | A visited headline. Never a browser purple. |
| `--rule-hair` | `#DAD7D0` | `#2E2F33` | 1.26 / 1.34 | Between items |
| `--rule-strong` | `#17171A` | `#ECEAE4` | 15.71 / 14.90 | Opens a section |
| `--edge` | `#C9C5BC` | `#3B3D42` | — | Around a photograph |

**The paper is warm on purpose.** A tint you can name is the cheapest identity in
editorial design — the Financial Times is recognisable by `#FFF1E5` alone. The
draft before this one used a cool near-white that was competent and anonymous,
and a blue-slate dark that is Tailwind's default and therefore invisible.

**`--accent` and `--machine` are isoluminant, and that is an invariant, not a
coincidence.** 5.05 against 4.88 in light, 5.00 against 4.94 in dark. The end
mark and the byline sit on one optical plane, so the accent reads as *a different
signal at the same volume* rather than as emphasis. Changing one without the
other breaks the page.

**The rule ladder is the single most valuable thing in the system.** The Athletic
runs forty-seven hairlines at 1.33:1 *and* forty-two section rules at 21:1, both
at 1px; Semafor ladders four steps by style rather than weight. The draft that
preceded this one had one rule at 1.27:1 doing every job, which is what made
twenty items read as twenty identical bands.

## Typography

Two faces. **Spectral** for everything read, **IBM Plex Mono** for everything the
machine stamped. Both OFL.

Spectral was chosen on measurement, not feel: it is narrow (0.5024 em average
lowercase), and on a phone that narrowness buys line-count uniformity — sixteen
of twenty descriptions set to exactly three lines at 16px, where 17px is a coin
flip between three and four.

| Role | Face | Size | Leading | Tracking |
|---|---|---|---|---|
| `date` | machine, tabular | `clamp(2.5rem, 7vw, 3.75rem)` | 0.98 | −0.035em |
| `mark` | machine, tabular | `clamp(3.25rem, 9vw, 4.5rem)` | 0.9 | 0.02em |
| `lead` | text 600 | `clamp(1.875rem, 3.2vw, 2.125rem)` | 1.12 | −0.02em |
| `feature` | text 600 | 1.3125rem | 1.2 | −0.012em |
| `brief` | text 600 | 1.0625rem | 1.4 | — |
| `dek` | text 400 | 0.9375rem | 1.6 | — |
| `label` | machine 500 | 0.6875–0.75rem | 1.4 | 0.083em, uppercase |

**Lead-to-tail ratio is 2.0 and must not exceed it.** Nothing in the measured
sample does: FT, Economist, Guardian, Bloomberg and Techmeme all sit at or just
under 2.0, and NYT, WaPo, AP and The Athletic run 1.30–1.45 because their
hierarchy comes from column span instead. An earlier draft was at 2.35 with
leading moving 1.06 → 1.22 → 1.40, which is a third variable changing for no
reason.

**Acronyms are set in small caps.** `AI`, `EU`, `US`, `CEO` in a serif line are
luminance spikes; the Economist wraps them rather than shrinking them, and a page
carrying them thirty times is measurably calmer for it.

**The first two words of each summary are bold.** Axios calls this an axiom: it
gives a block of running text an entry point without a headline element.

**`ss04` is not available.** IBM Plex Mono's undotted zero exists in the source
font and in no web build of it — verified by rendering the same string with and
without the feature on Google Fonts and on a self-hosted `@fontsource` woff2,
identical pixels both times. The dotted zero is the typeface as distributed.

## Layout

**Fix the gutter, fix the column, change only the count.** 60px column, 20px
gutter, at every width. The Guardian moves its column exactly once (60 → 40 at
740px) and never its gutter; the Washington Post moves neither and only drops
columns 20 → 16 → 12 → 10 → 1.

| Width | Tracks | Content | Features | Lead |
|---|---|---|---|---|
| ≥1296px | 16 | 1260px | 4-up | 10 cols image + 6 cols text |
| 976–1295px | 12 | 940px | 4-up | 7 + 5 |
| 656–975px | 12 at 40px | 700px | 2-up | 7 + 5 |
| <656px | 1 | full | 1-up | stacked |

**The measure never follows the grid.** `.dek` is capped at 46ch regardless of
how wide its column is. Every measured product does this: World in Brief holds a
672px column inside a 1376px canvas; the NYT sets 291px headline columns inside a
1200px grid.

**There is no right rail, and there will not be one.** Every rail measured
carries either a second content type (opinion, video, market data) or a second
sort of a much larger corpus. Sentinel has one type, one sort, and the corpus
fits on the page — Techmeme's rail is a verbatim copy of its own left column, and
the Economist's at 1440px is one promotion and an advertisement. The width goes
to more columns of the same list and to a real lead photograph.

## Images

**One aspect ratio, three sizes.** 3:2 everywhere, at 780px (lead), 300px
(feature) and none (brief). The Guardian runs 1.25 at 620/460/220/98; The
Athletic runs 1.50 at 600/453/162/118. A single thumbnail size across three tiers
makes the images carry no hierarchy at all and reads as a list of favicons.

**The ratio breaks exactly once, for the lead**, which runs 16:9. The Economist
does the same thing for its cover, and doing it once is what makes the break read
as a signal rather than an accident.

**Photographs run in colour.** A duotone would unify twenty publishers' colour
grades into one plate — which is what Espresso does — but Espresso has one
picture editor and these are twenty strangers' choices. The cost of the fix was
that every photograph stopped being a photograph. The 1px `--edge` is what keeps
a light image from bleeding into the paper.

**About a third of items arrive with no usable image**, and that is a designed
state, not a defect. See `states.html` 04.

## Depth

**This system has no elevation.** That is a decision, not an omission. Editorial
design has never had shadow, because newsprint has none, and every mechanism it
uses instead survives a daily cadence better than a surface effect does: scale,
negative space, the rule ladder, the hanging column, ink tone, and photography —
which is the only true second plane on the page.

Radius is pinned at `0`. Present and zero, not absent: absent means the next
component invents a value.

**The one exception is the ask button**, which is round and carries a shadow. It
is also the only element on the page that is software rather than paper, and the
only one that opens. Whether that reads as a deliberate signal or as a foreign
object is an open question — see *Open questions* below.

## Motion

Three rules, more important than the tokens.

- **Nothing animates on page load, ever.** An earlier draft faded in the end mark
  at load, six thousand pixels below the fold, so the only motion on the page
  played to nobody every single time. It is scroll-driven now and visible by
  default.
- **Instant down, eased up.** `:active` applies with no transition; the release
  eases over 120ms.
- `prefers-reduced-motion` is a hard gate, and the reduced path is the default
  state rather than a stripped one.

## Components

| Component | Variants | Notable states |
|---|---|---|
| `Masthead` | today, archive, no-edition | — |
| `EditionDate` | today, archive with year | — |
| `EditionBar` | dates, all-editions | next date present but dimmed |
| `ThemeNav` | — | derived from the items present, never hardcoded |
| `Item` | lead, feature, brief | rest, hover, active, focus-visible, **visited**, no-image, forced-colors |
| `Plate` | lead 16:9, feature 3:2 | image errored → typographic fallback |
| `Section` | — | absent when a theme has no items |
| `EditionClose` | full, thin | the mark carries the real count |
| `StaleBanner` | — | the only non-focus use of the accent |
| `AskButton` | — | rest, hover, active, focus-visible |
| `AskPanel` | — | idle, running, answered, **no result**, error |

**The block-link pattern is load-bearing and must not be reimplemented.** The
whole row is the target, but the accessible name is the title alone — without it
a screen reader announces roughly forty words per card. Cost: the description is
not selectable. Accepted.

**The theme row is derived from the edition's items.** A theme with no supply is
a correct edition, so hardcoding five chips would render a control that filters
to nothing — a dead control is worse than an absent one.

## Accessibility

Not a checklist; a foundation, in the way the Guardian ships `accessibility`
alongside `palette` and the BBC ships `Focus` as a foundation.

- Every text pair clears WCAG AA and most clear AAA. Ratios are in the colour
  table and in the CSS beside each token.
- **The machine layer recedes by size, tracking and case — never by contrast,
  never by opacity.** It is 9% of a card's ink; it is already quiet by structure,
  and buying more quiet with grey is how a layer falls below AA for nothing.
- The measure is ~68 characters, inside the BBC's *"between 60 and 70 is better
  still"*. Body leading is 1.6 against their floor of 1.5. The lead headline is
  1.12 against their 1.125 for large headings.
- `forced-colors: active` is handled: the whole hierarchy rides on three greys
  and collapses to one tone there, so rules get `CanvasText` and the machine
  layer `GrayText`.
- The ask panel is a `<dialog>` opened with `showModal()`, which supplies
  Escape, a focus trap, an inert background and a real backdrop with no script.
  **Its `display` must stay scoped to `[open]`** — a bare `display: flex`
  overrides the browser's `display: none` for the closed state and the panel can
  never close.
- Images are `alt=""`. They are decorative relative to a headline and a summary
  that carry the whole meaning, and inventing alt text for a photograph nobody
  here has seen is exactly what the honesty principle forbids.

## Do not build

The system should be as small as the product.

**No icon set.** Any glyph is a character in IBM Plex Mono, or it does not exist.
A library adds a third visual language — geometric line art — to a page whose
entire thesis is two typefaces.

**No shadow scale, no radius scale, no opacity ramp, no z-index scale, no
primitive colour ramp.** Nothing floats but the one button, nothing opens but the
one panel.

**No colour-coded themes.** It is the obvious editorial move — it is literally
what the Guardian does with its pillars — and it is wrong here: thirty items a
day colour-coded by category turns a record into a dashboard, and it puts a
second colour system in a fight with thirty photographs the design does not
control.

**No `Card`, `Button`, `Modal`, `Dropdown`, `Toast`, `Skeleton`.** The item is
not a card, and naming it one invites four-sided borders and a radius within a
month. Nothing loads: the page is prerendered.

**No density toggle.** No major news product has one — the density change is
baked into the page as the three tiers. A global compact mode would flatten
exactly the signal the tiers exist to carry.

**No per-theme routes and no load-more.** The day is the unit, and it ends.

## Open questions

- **The ask button is round and shadowed in a system pinned at zero radius with
  no elevation.** Deliberate signal or foreign object — decide after living with
  it for a week.
- **`culture` is the weakest theme.** It is well sourced but exists to make five,
  and nothing in the brief says this reader wants it. `space` was proposed as a
  narrower but truer alternative.
- **The lead card leaves dead space** under its text column when the photograph
  is taller than the headline. Every measured newspaper has the same
  characteristic; it may simply be what a lead card looks like.
