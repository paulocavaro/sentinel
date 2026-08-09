// Builds an edition reference: the whole page, rendered from a real edition in
// content/days.
//
//   node design-refs/build-home.mjs              → the latest edition → home.html
//   node design-refs/build-home.mjs 2026-08-08   → that edition       → day.html
//
// One script, two outputs, because the screens map in .loop/config.md has two
// edition screens: `home` is whatever the pipeline published last, and `day` is
// an archive date asked for by name. The output is named after the screen and
// not after the date — a 2026-08-08.html would not be in the map, and refs_dir
// is one file per screen, so dated filenames would either need a config edit
// every time the pinned day moves or leave orphans accumulating beside it.
//
// The two are the same script rather than two, so the day page cannot drift
// from the home page; the differences between them are entirely in the data.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DAYS = `${ROOT}/content/days`

const dates = readdirSync(DAYS)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.slice(0, -5))
  .sort()

const arg = process.argv[2]
if (arg && !dates.includes(arg)) {
  throw new Error(`no edition for ${arg}. Have: ${dates.join(', ')}`)
}
const editionDate = arg ?? dates[dates.length - 1]
const outfile = arg ? 'day.html' : 'home.html'

const ed = JSON.parse(readFileSync(`${DAYS}/${editionDate}.json`, 'utf8'))

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const host = (u) => new URL(u).hostname.replace(/^www\./, '')
const smallCaps = (s) => s.replace(/\b([A-Z]{2,4})\b/g, '<span class="acr">$1</span>')
const leadIn = (s) => {
  const m = s.match(/^(\S+\s+\S+)(\s+)([\s\S]*)$/)
  return m ? `<b class="entry">${smallCaps(esc(m[1]))}</b>${m[2]}${smallCaps(esc(m[3]))}` : smallCaps(esc(s))
}

const THEMES = [
  ['ai', 'Artificial intelligence'],
  ['world', 'The world'],
  ['games', 'Games'],
  ['science', 'Science'],
  ['culture', 'Culture'],
]

const atNoon = (d) => new Date(`${d}T12:00:00Z`)
const fmt = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
const shift = (d, n) => {
  const x = atNoon(d)
  x.setUTCDate(x.getUTCDate() + n)
  return x
}

const date = atNoon(ed.date)
const weekday = date.toLocaleDateString('en-GB', { weekday: 'long' })
const dayMonth = fmt(date)

// Prev and next are the nearest editions that exist, not the calendar
// neighbours. On a pipeline designed to miss days, ±1 unconditionally sends
// half the links at a day the archive never wrote. When a direction has no
// edition at all the slot still shows the calendar neighbour's date — present,
// not offered — and it is the absent arrow, not a dimmer grey, that says so.
//
// The unavailable slot is a `<span>` and its state is a word, not an attribute.
// It was an `<a>` with no href and `aria-disabled="true"`, which announces
// nothing at all: an anchor with no href has role `generic`, `aria-disabled` is
// not a global attribute, and `generic` does not support it — measured in
// Chromium, where the whole bar collapsed to one text run. What a reader with a
// screen reader is owed here is the fact, and the fact is text.
const idx = dates.indexOf(ed.date)
const prevDate = idx > 0 ? dates[idx - 1] : null
const nextDate = idx < dates.length - 1 ? dates[idx + 1] : null

const prevSlot = prevDate
  ? `<a class="day" href="/day/${prevDate}" rel="prev">← ${fmt(atNoon(prevDate))}</a>`
  : `<span class="day is-off">${fmt(shift(ed.date, -1))}<span class="sr-only"> (no edition)</span></span>`
const nextSlot = nextDate
  ? `<a class="day" href="/day/${nextDate}" rel="next">${fmt(atNoon(nextDate))} →</a>`
  : `<span class="day is-off">${fmt(shift(ed.date, 1))}<span class="sr-only"> (no edition)</span></span>`

const link = (i, cls = '') =>
  `<a class="link ${cls}" href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">${smallCaps(esc(i.title))}<span class="sr-only"> (opens at ${esc(host(i.url))})</span></a>`

const byline = (i) => `<p class="byline">${esc(i.publisher)}</p>`
const plate = (i, cls) =>
  i.image ? `<span class="plate ${cls}"><img class="art" src="../public${i.image}" alt="" loading="lazy" decoding="async"></span>` : ''

// `dir="auto"` on every element that carries a stranger's words. There is no
// other `dir` in the document, so the page is `lang="en"` and left-to-right
// throughout — and a headline that opens with an Arabic or Hebrew name is a
// right-to-left paragraph inside it. Without this the bidi algorithm resolves
// that line against the page's direction: the neutral characters between the
// name and the English that follows it reorder, and the trailing publisher can
// land at the wrong end of the line. Per element, because the direction is a
// property of each item's own text and not of the page.
// (`lib/ingest/sanitize.ts` already strips bidi *controls* at ingest. This is
// ordinary right-to-left data, not an attack.)
const leadCard = (i) => `      <article class="item lead">
        ${plate(i, 'plate-lead')}
        <div class="body">${byline(i)}
          <h2 class="head" dir="auto">${link(i)}</h2>
          <p class="dek" dir="auto">${leadIn(i.description)}</p>
        </div>
      </article>`

const feature = (i) => `        <article class="item feature">
          ${plate(i, 'plate-feature')}
          <div class="body">${byline(i)}
            <h3 class="head" dir="auto">${link(i)}</h3>
            <p class="dek" dir="auto">${leadIn(i.description)}</p>
          </div>
        </article>`

// The summary runs on after an em dash rather than opening a new block, which
// is how Techmeme fits thirty attributed items on a screen without a card.
const brief = (i) => `        <article class="item brief">
          <div class="body">${byline(i)}
            <h3 class="head" dir="auto">${link(i)}</h3><span class="dash" aria-hidden="true"> — </span><span class="run" dir="auto">${smallCaps(esc(i.description))}</span>
          </div>
        </article>`

// key and label are null for an edition whose items carry no theme — the
// archive holds one, from before the field existed. That edition is not
// mis-grouped into five empty sections and it is not dropped: it is one
// unlabelled group, which is a section with no name and therefore no
// --rule-strong opening it.
const section = (key, label, items) => {
  const features = items.slice(0, 4).map(feature).join('\n')
  const briefs = items.slice(4).map(brief).join('\n')
  const open = key
    ? `<section class="section" id="${key}" aria-labelledby="${key}-name">
      <h2 class="section-name" id="${key}-name">${label}</h2>`
    : `<section class="section">`
  return `    ${open}
      <div class="features">
${features}
      </div>${briefs ? `\n      <div class="briefs">\n${briefs}\n      </div>` : ''}
    </section>`
}

const lead = ed.items.find((i) => i.rank === 1)
const rest = ed.items.filter((i) => i.rank !== 1)
const present = THEMES.filter(([k]) => rest.some((i) => i.theme === k))

// The theme row is derived from the items present. An edition with no themes
// produces no row at all rather than five chips that filter to nothing — a dead
// control is worse than an absent one.
//
// One href, two behaviours. `?theme=ai#ai` is a link to a section for a reader
// with no script — which is all this file ever is — and the instruction to
// filter for one with script; the app reads the parameter and puts two classes
// on <main>, and the stylesheet below does the rest. The live region is here
// for the same reason the query is: this document and the app are one design in
// two places, and a difference that is invisible is still a difference.
const themeNav = present.length
  ? `
    <nav aria-label="Themes">
      <ul class="themes">
        <li><a class="chip" href="?#results" aria-current="true">Everything</a></li>
        ${present.map(([k, label]) => `<li><a class="chip" href="?theme=${k}#${k}">${label}</a></li>`).join('\n        ')}
      </ul>
      <p class="sr-only" role="status" aria-live="polite">Showing the whole edition.</p>
    </nav>`
  : ''

const sections = present.length
  ? present.map(([k, label]) => section(k, label, rest.filter((i) => i.theme === k))).join('\n')
  : section(null, null, rest)

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sentinel, ${weekday} ${dayMonth}</title>
<meta name="theme-color" content="#F2F0EB" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#16171A" media="(prefers-color-scheme: dark)">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Spectral:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
<style>
/* ─── Sentinel · design reference ───────────────────────────────────────────
   Direction: "the record". Closed at 09:23, dated, never rewritten.

   The desktop grid is measured off real newspapers rather than invented:

   · Fix the gutter, fix the column, change only the count. The Guardian holds a
     20px gutter at every width and moves its column from 60 to 40 exactly once;
     the Washington Post holds 34/32 and only drops columns 20 → 16 → 12 → 10.
   · One aspect ratio, four image sizes. The Guardian runs 1.25 at 620/460/220/98,
     The Athletic 1.50 at 600/453/162/118. A single thumbnail size across three
     tiers reads as a list of favicons.
   · Lead-to-tail type ratio never exceeds 2.0 anywhere in the sample, and line
     height stays a near-constant ratio. The previous draft was at 2.35 with the
     leading moving 1.06 → 1.22 → 1.40, which is a third variable changing for
     no reason.
   · No right rail. Every rail in the sample carries a second content type or a
     second sort of a much larger corpus. This product has one type, one sort,
     and it fits on the page — Techmeme's rail is a verbatim copy of its own left
     column, and the Economist's is a promo and an advertisement. The width goes
     to more columns of the same list and to a real lead photograph.
   ────────────────────────────────────────────────────────────────────────── */

:root {
  color-scheme: light dark;

  --paper:   light-dark(#F2F0EB, #16171A);
  --ink:     light-dark(#17171A, #ECEAE4);  /* 15.71 / 14.90 */
  --prose:   light-dark(#3D3B36, #B8B4AC);  /*  9.82 /  8.67 */
  --machine: light-dark(#6B6862, #8A867E);  /*  4.88 /  4.94 */
  --accent:  light-dark(#8A5D0F, #B07E28);  /*  5.05 /  5.00 — isoluminant with --machine */
  --read:    light-dark(#6E6A61, #87837B);  /*  4.73 /  4.75 */

  --rule-hair:   light-dark(#DAD7D0, #2E2F33);
  --rule-strong: light-dark(#17171A, #ECEAE4);
  --edge:        light-dark(#C9C5BC, #3B3D42);

  /* Two faces, named once, and never named again. This file loads them from the
     Google stylesheet linked above, so the properties name the families
     directly; app/globals.css points the same two properties at its next/font
     variables. That pair of lines is the only difference between the two. */
  --face-text:    Spectral, Georgia, serif;
  --face-machine: 'IBM Plex Mono', ui-monospace, monospace;

  --col: 60px;
  --gap: 20px;
  --tracks: 16;
  --content: calc(var(--tracks) * var(--col) + (var(--tracks) - 1) * var(--gap));

  --ratio: 3 / 2;                 /* one aspect ratio, held everywhere */
  --dur-tap: 120ms;
  --ease-out: cubic-bezier(0.2, 0, 0, 1);
}

:root[data-theme="light"] { color-scheme: light; }
:root[data-theme="dark"]  { color-scheme: dark;  }

*, *::before, *::after { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--face-text);
  -webkit-font-smoothing: antialiased;
}

.sr-only {
  position: absolute; width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden;
  clip-path: inset(50%); white-space: nowrap;
}

/* The skip link: the first focusable thing in the document, and the only way
   past nineteen item links to the footer that does not cost nineteen presses.
   It is deliberately not .sr-only. That class clips an element to one pixel,
   which is right for text that must never be seen and wrong for a control whose
   whole job is to appear the moment it is reached — unclipping it means putting
   six properties back. A fixed box translated up by its own height is off the
   viewport, still focusable, still in the accessible tree, and comes back with
   one property.
   :focus, not :focus-visible. The link cannot be clicked while it is off the
   viewport, so every focus it ever gets is a keyboard's, and the two selectors
   mean the same thing here — except that :focus-visible is the one that would
   fail if a screen reader moved focus to it without a key press.
   The box is paper with the ring drawn inside its own edge rather than a border
   plus a ring, so the control has one line around it and not two. */
.skip {
  position: fixed; top: 0; left: 0; z-index: 30;
  transform: translateY(-100%);
  font-family: var(--face-machine);
  font-size: 0.75rem; font-weight: 500; letter-spacing: 0.083em;
  text-transform: uppercase; color: var(--ink); text-decoration: none;
  background: var(--paper); padding: 0.875rem 1.25rem;
}
.skip:focus { transform: none; outline: 2px solid var(--ink); outline-offset: -2px; }

.page { width: min(100% - 2.5rem, var(--content)); margin-inline: auto; }

.acr { font-variant-caps: all-small-caps; letter-spacing: 0.03em; }

/* ─── Masthead ───────────────────────────────────────────────────────────── */

.masthead { padding: 3rem 0 1.5rem; }

/* The body of a page that is not an edition.
   Five surfaces are a masthead, one sentence saying what happened, and the way
   out: no such page, this page did not render, a day with no edition, a day
   whose edition will not read, and an empty archive. All five used to put every
   one of those elements inside header.masthead, which told a landmark reader
   the page was a banner from top to bottom, and left the skip link above with
   nowhere to go. The sentence and the links are a main element now.
   These two rules are the entire pixel cost of that, and they cancel it. The
   masthead's 1.5rem of closing space is what separated its last line from the
   sentence under it; with the header ending early that space would land between
   the two blocks *and* the sentence's own 1rem margin would follow it, opening
   a gap the design never had. So the space moves with the content — off the
   header, onto the end of the main, where it closes the page exactly as it did
   before. Nothing else about these five pages changes. */
.masthead:has(+ .wayout) { padding-bottom: 0; }
.wayout { padding-bottom: 1.5rem; }

.wordmark {
  font-family: var(--face-machine);
  font-size: 0.75rem; font-weight: 500; letter-spacing: 0.083em;
  text-transform: uppercase; color: var(--machine); margin: 0;
}

.editiondate {
  font-family: var(--face-machine);
  font-variant-numeric: tabular-nums;
  font-size: clamp(2.5rem, 7vw, 3.75rem);
  font-weight: 400; line-height: 0.98; letter-spacing: -0.035em;
  color: var(--ink); margin: 0.75rem 0 0 -0.055em;
}
.editiondate .weekday { color: var(--machine); }

.manifest {
  font-size: 1.0625rem; font-style: italic; line-height: 1.45;
  color: var(--prose); margin: 1rem 0 0; max-width: 30em;
}

.promise {
  font-family: var(--face-machine);
  font-size: 0.6875rem; font-weight: 500; letter-spacing: 0.09em;
  text-transform: uppercase; color: var(--machine); margin: 0.875rem 0 0;
}

/* Section headings are the navigation. Selected state on two visual channels
   plus aria-current, which is the cheapest correct version in the sample. */
.themes { list-style: none; display: flex; flex-wrap: wrap; gap: 1.5rem;
          margin: 1.75rem 0 0; padding: 0 0 1.25rem; }
.chip {
  font-family: var(--face-machine);
  font-size: 0.75rem; font-weight: 500; letter-spacing: 0.083em;
  text-transform: uppercase; color: var(--machine); text-decoration: none;
  padding-bottom: 0.25rem; border-bottom: 2px solid transparent;
}
.chip:hover { color: var(--ink); border-bottom-color: var(--accent); }
/* Selected, and the two channels the comment above promises. One: the label
   goes from --machine to full ink. Two: the 2px rule the chip has been
   reserving all along turns on, in --rule-strong — the same weight that opens
   a section, because a selected chip *is* an opened section. Ink rather than
   the accent keeps selected legible against hover and keeps the accent scarce.
   The rule is also the channel that survives forced-colors, where every
   anchor's colour is forced to LinkText and channel one disappears.
   Written as [aria-current]:not([aria-current="false"]) rather than the bare
   attribute: React renders aria-current={false} as the string "false", which
   is the ARIA value for *not* current, and the bare selector would paint every
   unselected chip as the selected one. */
.chip[aria-current]:not([aria-current="false"]) {
  color: var(--ink); border-bottom-color: var(--rule-strong);
}

/* The edition bar: which day you are reading, and the one control the product
   has. World in Brief puts its date and pager in a full-width bar above the
   column; this is the same idea with the archive's own vocabulary — dates, not
   Previous and Next, which are ambiguous under a date (later in time, or
   further back into the archive?). */
.editionbar { margin-top: 1.5rem; }
.days { display: flex; flex-wrap: wrap; gap: 1.25rem; align-items: baseline; }
.day {
  font-family: var(--face-machine);
  font-size: 0.75rem; font-weight: 500; letter-spacing: 0.083em;
  text-transform: uppercase; color: var(--machine); text-decoration: none;
  border-bottom: 1px solid var(--rule-hair); padding-bottom: 1px;
}
.day:hover { color: var(--ink); border-bottom-color: var(--ink); }
.day.is-current { color: var(--ink); border-bottom-color: transparent; }
/* Present, not offered — never removed. This was opacity: 0.45, which
   composites --machine to #B5B3AD on light paper and #4A4947 on dark: 1.84:1
   and 1.99:1, nowhere near AA, and bought by the one mechanism the system
   forbids — the machine layer recedes by size, tracking and case and never by
   opacity, because it is already 9% of a card's ink and quiet by structure.
   So the unavailable direction keeps the full --machine tone, 4.88:1 and
   4.94:1, the same as every other label on the page, and recedes by losing the
   two marks that say a date can be reached: its arrow, which is markup, and
   its hairline, which is here. Its hover goes nowhere for the same reason. */
.day.is-off { border-bottom-color: transparent; }
.day.is-off:hover { color: var(--machine); border-bottom-color: transparent; }
/* .day-all needs no declaration of its own now that the hairline lives on
   .day. The class stays: it is the hook the all-editions link is named by. */

/* The one round thing in a system whose form language is pinned at zero radius.
   A newspaper has no rounded corners, so this reads as arriving from somewhere
   else — which is the point: it is the only element on the page that is software
   rather than paper, and the only one that opens. Its word is set in the machine
   face for the same reason. */
.ask-fab {
  position: fixed; right: 1.5rem; bottom: 1.5rem; z-index: 20;
  width: 3.5rem; height: 3.5rem; border-radius: 50%;
  display: grid; place-items: center;
  background: var(--ink); color: var(--paper);
  border: 0; cursor: pointer;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.28), 0 8px 24px rgb(0 0 0 / 0.18);
  transition: transform var(--dur-tap) var(--ease-out), background-color var(--dur-tap) var(--ease-out);
}
.ask-fab-word {
  font-family: var(--face-machine);
  font-size: 0.75rem; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase;
}
.ask-fab:hover { background: var(--accent); }
.ask-fab:active { transform: scale(0.96); transition: none; }
.ask-fab:focus-visible { outline: 2px solid var(--ink); outline-offset: 4px; }
@media (prefers-reduced-motion: reduce) { .ask-fab { transition: none; } }

/* <dialog> + showModal gives Escape, a focus trap, an inert background and a
   real backdrop for free — the four things that made the FT's drawer the only
   unbroken one in the sample, none of them hand-written here. */
.panel {
  position: fixed; inset: 0 0 0 auto; margin: 0;
  width: min(26rem, 100%); max-width: none; height: 100dvh; max-height: none;
  background: var(--paper); color: var(--ink);
  border: 0; border-left: 1px solid var(--rule-strong); padding: 0;
}
/* Scoped to [open]. A bare display:flex on the dialog overrides the UA's
   display:none for the closed state, so the panel is open from page load and
   never closes — which is what happened the first time this was written. */
.panel[open] { display: flex; flex-direction: column; }
.panel::backdrop { background: rgb(0 0 0 / 0.5); }

.panel-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--rule-hair);
}
.panel-title, .panel-x {
  font-family: var(--face-machine);
  font-size: 0.75rem; font-weight: 500; letter-spacing: 0.083em; text-transform: uppercase;
}
.panel-title { color: var(--ink); margin: 0; }
.panel-x { color: var(--machine); background: none; border: 0; cursor: pointer;
           padding: 0.625rem; margin: -0.625rem; min-height: 44px; }
.panel-x:hover { color: var(--ink); }

.panel-body { padding: 1.5rem; overflow-y: auto; }
.panel-label { display: block; font-size: 1rem; line-height: 1.5; color: var(--prose); margin: 0 0 0.875rem; }
.panel-input {
  width: 100%; font-family: var(--face-text); font-size: 1.0625rem;
  color: var(--ink); background: transparent;
  border: 0; border-bottom: 1px solid var(--rule-strong); border-radius: 0;
  padding: 0.625rem 0; min-height: 44px;
}
.panel-input::placeholder { color: var(--machine); }
.panel-input:focus-visible { outline: 2px solid var(--ink); outline-offset: 4px; }
.panel-note { font-size: 0.875rem; line-height: 1.55; color: var(--machine); margin: 1rem 0 0; }

/* ─── The lead ───────────────────────────────────────────────────────────── */

.lead {
  display: grid; gap: var(--gap);
  grid-template-columns: repeat(var(--tracks), minmax(0, 1fr));
  align-items: start;
  padding: 1.75rem 0 2.5rem;
  border-top: 1px solid var(--rule-strong);
  position: relative;
}
.plate-lead { grid-column: span 10; }
.lead .body { grid-column: span 6; }
/* A lead with no photograph. There is no ten-column plate to sit beside, so
   the text takes the whole measure instead of keeping six of sixteen tracks
   and leaving ten empty columns to its right — which is what the page did
   before this line existed. The lead headline is not promoted to compensate:
   it is already at 2.125rem against the brief's 1.0625, exactly the 2.0
   lead-to-tail ratio the system caps itself at, so width is the only channel
   left. It has not happened yet — every lead in the archive carries an image —
   which is precisely why it is written before it does.
   Specificity is (0,3,0) against the media queries' (0,2,0), so it holds at
   every width without being repeated in each one. */
.lead:not(:has(.plate)) .body { grid-column: 1 / -1; }
/* The one place the ratio breaks. The Economist does this exactly once, for its
   cover, which is what makes the break read as a signal rather than an accident:
   at 3/2 the lead plate stands taller than the column beside it and leaves the
   text hanging over dead space. */
.plate-lead .art { aspect-ratio: 16 / 9; }
.lead .head { font-size: clamp(1.875rem, 3.2vw, 2.125rem); line-height: 1.12; letter-spacing: -0.02em; text-wrap: balance; }
.lead .dek  { font-size: 1.0625rem; }

/* ─── Sections ───────────────────────────────────────────────────────────── */

.section { padding-top: 2.25rem; }

.section-name {
  font-family: var(--face-machine);
  font-size: 0.75rem; font-weight: 500; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--ink);
  margin: 0; padding-top: 0.75rem;
  border-top: 1px solid var(--rule-strong);
}

.features {
  display: grid; gap: var(--gap) var(--gap);
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-top: 1.5rem;
}

/* A section with no name still opens.
   The token table's job for --rule-strong is "opens a section", but the rule
   that does it is attached to .section-name — so the one edition whose items
   carry no theme renders a section with no name, no rule and therefore no
   opening at all: the lead stops, and four features begin an inch and a half
   later with nothing in between. It reads as a gap rather than as a
   transition, and a page whose only strong rule is the one above the lead is
   the twenty-identical-bands failure the ladder exists to prevent, arrived at
   from the other side.
   So when the name is absent the rule hangs on the features block instead, at
   exactly the offset the name's own border occupies — the section's 2.25rem of
   padding — and the labelled page is untouched to the pixel. Nothing is
   invented for the occasion: same token, same weight, same position, minus the
   word. What is deliberately *not* done is a rhythm rule every N briefs; every
   mark in this system stands for something (this is the lead, this is a
   section, this is where one item ends), and a divider placed by counting would
   be the first one on the page that means nothing. */
.section:not(:has(.section-name)) > .features {
  border-top: 1px solid var(--rule-strong);
  margin-top: 0; padding-top: 1.5rem;
}

.briefs {
  display: grid; gap: 0 calc(var(--gap) * 2);
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 1.75rem;
  border-top: 1px solid var(--rule-hair);
}

/* ─── Items ──────────────────────────────────────────────────────────────── */

.item { position: relative; min-width: 0; }
.feature { padding-bottom: 0.5rem; }
.brief { padding: 1rem 0; border-top: 1px solid var(--rule-hair); }
.briefs .brief:first-child, .briefs .brief:nth-child(2) { border-top: 0; }

.byline {
  font-family: var(--face-machine);
  font-size: 0.6875rem; font-weight: 500; line-height: 1.4;
  letter-spacing: 0.083em; text-transform: uppercase;
  color: var(--machine); margin: 0 0 0.3125rem;
}

.head { margin: 0; font-weight: 600; }
.feature .head { font-size: 1.3125rem; line-height: 1.2; letter-spacing: -0.012em; }
.brief .head   { font-size: 1.0625rem; line-height: 1.4; display: inline; }

/* A feature with no photograph. About a third of items arrive without a usable
   image, so this is an ordinary day rather than an exception, and the card is
   not a card with a hole in it: the headline takes the space the picture would
   have had. One step up the same ladder, not a fourth size invented for the
   occasion — 1.3125 → 1.625rem, leading 1.2 → 1.16, tracking −0.012 → −0.016em
   is the feature tier interpolated toward the lead's 2.125 / 1.12 / −0.02, so
   leading still moves with size instead of becoming a third free variable. It
   stops well short of the lead: 1.625 over the tail's 1.0625 is 1.53 against
   the ceiling of 2.0.
   Only the feature tier gets a rule. A brief never carries a plate at all, so
   the general .item:not(:has(.plate)) rule would promote all fifteen of them and
   the compact tier would stop existing; and a lead cannot be promoted because
   it is already at the ceiling — it takes the full measure instead, above. */
.feature:not(:has(.plate)) .head {
  font-size: 1.625rem; line-height: 1.16; letter-spacing: -0.016em;
}

.link { color: inherit; text-decoration: none; }
.link::after { content: ""; position: absolute; inset: 0; }
.link:visited { color: var(--read); }

.dek {
  font-size: 0.9375rem; line-height: 1.6; color: var(--prose);
  margin: 0.4375rem 0 0; max-width: 46ch;      /* the measure never follows the grid */
  text-wrap: pretty;
}
.entry { font-weight: 600; color: var(--ink); }
.brief .dash { color: var(--machine); }
.brief .run  { font-size: 1.0625rem; line-height: 1.4; color: var(--prose); }

/* The three elements on the page that carry a stranger's words, and the only
   three that can be handed a string with no legal break point in it.
   lib/ingest/sanitize.ts permits a single token of 200 characters — a URL in a
   headline, a hashtag, a compound noun — and a feature column is four 60px
   tracks wide, so one of those runs out of its column and across the one beside
   it. Breaking inside a word is worse typography than not breaking; a headline
   nobody can read is worse than both.
   break-word rather than anywhere, which additionally shrinks the element's
   min-content size — the grid would hand that back to the other columns, and
   how wide a track is has never been the text's business. */
.head, .dek, .run { overflow-wrap: break-word; }

/* Photographs run in colour. A duotone would unify twenty publishers' colour
   grades into one plate, which is what Espresso does — but Espresso has one
   picture editor and these are twenty strangers' choices, so the cost is that
   every photograph stops being a photograph. The 1px edge is what keeps a light
   image from bleeding into the paper. */
.plate { position: relative; display: block; }
.art { display: block; width: 100%; aspect-ratio: var(--ratio); object-fit: cover;
       border: 1px solid var(--edge); }
.plate-feature { margin-bottom: 0.75rem; }

.item:hover  { background: color-mix(in oklab, var(--ink) 3%, transparent); }
.item:active { background: color-mix(in oklab, var(--ink) 6%, transparent); }
@media (hover: hover) {
  .item { transition: background-color var(--dur-tap) var(--ease-out); }
  .item:active { transition: none; }
}
.item:has(.link:focus-visible) { outline: 2px solid var(--ink); outline-offset: 4px; }

/* ─── The filtered view ──────────────────────────────────────────────────────
   A selected chip is a filter, and the filter is two classes on <main>:
   is-filtered, which is the mode, and filter-<theme>, which is the one
   section that stays. Nothing else on the page knows. The DOM underneath is the
   same server-rendered edition either way, which is what keeps the route
   prerendered and keeps the no-script path — an anchor to a section that is
   still there — working. The reference never carries the classes and neither
   file needs to: they carry the rules, and they are one stylesheet in two
   places. app/components/ThemeFilter.tsx is what puts the classes on.

   The visible section goes compact rather than re-tiered. A brief is a
   different shape — no plate, an inline headline, a dash and a run — so
   re-tiering means re-rendering every item, on the client or at request time,
   and both were refused. What the eye reads as compact is three differences and
   all three are CSS: the plates go, the features grid goes to one column, and
   the headline steps down. The step is the one the narrow width already takes,
   1.3125 → 1.1875rem, rather than a fourth size invented for the occasion.

   It deliberately also overrides the no-photograph promotion. With every plate
   hidden, a promoted headline would be the only line in the list set larger for
   a reason that is no longer on the screen. It wins on specificity rather than
   on order — main.is-filtered .feature .head is (0,3,1) against the
   promotion's (0,3,0) — so it holds inside the width queries below as well.

   The briefs block is deliberately left alone. Collapsing it too was tried and
   looked worse at 1440: two columns is where a compact item already reads on
   this page, and one column runs the same line to 1260px, three times the
   measure the deks beside it are capped at. The section still reads as one list
   because the step from a one-column run of features into a two-column run of
   briefs is the step the unfiltered page makes as well. */

main.is-filtered > .lead,
main.is-filtered > .section { display: none; }

main.filter-ai      > #ai,
main.filter-world   > #world,
main.filter-games   > #games,
main.filter-science > #science,
main.filter-culture > #culture { display: block; }

main.is-filtered .plate { display: none; }
main.is-filtered .features { grid-template-columns: 1fr; gap: 1.75rem; }
main.is-filtered .feature .head { font-size: 1.1875rem; }

/* ─── The end ────────────────────────────────────────────────────────────── */

.close { padding: 6rem 0 5rem; }
.close-mark {
  font-family: var(--face-machine);
  font-variant-numeric: tabular-nums;
  font-size: clamp(3.25rem, 9vw, 4.5rem); line-height: 0.9; letter-spacing: 0.02em;
  color: var(--accent); margin: 0 0 1.25rem -0.11em;
}
.close-sentence { font-size: 1.0625rem; line-height: 1.5; color: var(--ink); margin: 0; }
.close-next {
  font-family: var(--face-machine);
  font-size: 0.6875rem; font-weight: 500; letter-spacing: 0.09em; text-transform: uppercase;
  color: var(--machine); margin: 0.625rem 0 0;
}
@media (prefers-reduced-motion: no-preference) {
  .close-mark { animation: settle 1ms linear both; animation-timeline: view(); animation-range: entry 0% entry 60%; }
}
@keyframes settle { from { opacity: 0; } to { opacity: 1; } }

/* ─── Only the count changes ─────────────────────────────────────────────── */

@media (max-width: 81rem)  { :root { --tracks: 12; } .plate-lead { grid-column: span 7; } .lead .body { grid-column: span 5; } }
@media (max-width: 61rem)  { :root { --col: 40px; }
  .features { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 41rem)  {
  .page { width: calc(100% - 2.5rem); }
  .lead { grid-template-columns: 1fr; }
  .plate-lead, .lead .body { grid-column: 1; }
  .features { grid-template-columns: 1fr; gap: 1.75rem; }
  .briefs { grid-template-columns: 1fr; }
  .briefs .brief:nth-child(2) { border-top: 1px solid var(--rule-hair); }
  .feature .head { font-size: 1.1875rem; }
  /* the promotion holds the same ~1.24 step over the tier it belongs to */
  .feature:not(:has(.plate)) .head { font-size: 1.4375rem; }
  .dek { max-width: none; }
}

@media (forced-colors: active) {
  .brief, .briefs { border-top: 1px solid CanvasText; }
  .section-name, .lead,
  .section:not(:has(.section-name)) > .features { border-top: 2px solid CanvasText; }
  .byline { color: GrayText; }
}
</style>
</head>
<body>
<a class="skip" href="#results">Skip to the content</a>
<button class="ask-fab" type="button" aria-haspopup="dialog" aria-controls="ask" onclick="document.getElementById('ask').showModal()"><span class="ask-fab-word">Ask</span><span class="sr-only"> this archive</span></button>

<div class="page">
  <header class="masthead">
    <p class="wordmark">Sentinel</p>
    <h1 class="editiondate"><span class="weekday">${weekday}</span> ${dayMonth}</h1>
    <p class="manifest">${esc(ed.summary)}</p>
    <p class="promise">${ed.items.length} items · closed 09:23</p>
    <div class="editionbar">
      <nav class="days" aria-label="Editions">
        ${prevSlot}
        <span class="day is-current" aria-current="date"><span class="sr-only">Reading </span>${dayMonth}</span>
        ${nextSlot}
        ${arg ? '<a class="day day-all" href="/">Latest edition</a>\n        ' : ''}<a class="day day-all" href="/archive">All editions</a>
      </nav>
    </div>${themeNav}
  </header>

  <main id="results" tabindex="-1">
${leadCard(lead)}
${sections}
  </main>

  <dialog class="panel" id="ask" aria-label="Ask this archive">
    <form method="dialog" class="panel-head">
      <p class="panel-title">Ask this archive</p>
      <button class="panel-x" aria-label="Close">Close</button>
    </form>
    <div class="panel-body">
      <label class="panel-label" for="q">Ask about anything that has run in an edition.</label>
      <input class="panel-input" id="q" type="text" placeholder="What did OpenAI ship this week?" autocomplete="off">
      <p class="panel-note">Answers cite the item and the day it ran. If nothing here matches, it says so rather than inventing one.</p>
    </div>
  </dialog>

  <footer class="close">
    <p class="close-mark" aria-hidden="true">-${ed.items.length}-</p>
    <p class="close-sentence">That was ${weekday} ${dayMonth}.</p>
    <p class="close-next">Next edition 09:23 tomorrow</p>
    <span class="sr-only">End of edition.</span>
  </footer>
</div>
</body>
</html>
`

writeFileSync(`${ROOT}/design-refs/${outfile}`, html)
console.log(`escrito: design-refs/${outfile} — ${ed.date}, ${ed.items.length} itens`)
console.log('lead:', lead.publisher)
if (present.length) {
  for (const [k, label] of present) {
    const n = rest.filter((i) => i.theme === k).length
    console.log(`  ${label.padEnd(24)} ${n} itens — ${Math.min(4, n)} destaque, ${Math.max(0, n - 4)} compacto`)
  }
} else {
  console.log(`  sem temas — um grupo sem rótulo: ${Math.min(4, rest.length)} destaque, ${Math.max(0, rest.length - 4)} compacto`)
}
console.log(`  sem foto: ${ed.items.filter((i) => !i.image).length} de ${ed.items.length}`)
