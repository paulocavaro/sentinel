import { readFileSync, writeFileSync } from 'node:fs'

const ROOT = '/Users/pauloluiz/dev/sentinel'
const ed = JSON.parse(readFileSync(`${ROOT}/content/days/2026-08-09.json`, 'utf8'))

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

const date = new Date(`${ed.date}T12:00:00Z`)
const weekday = date.toLocaleDateString('en-GB', { weekday: 'long' })
const dayMonth = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })

const prev = new Date(date); prev.setUTCDate(prev.getUTCDate() - 1)
const prevLabel = prev.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })

const link = (i, cls = '') =>
  `<a class="link ${cls}" href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">${smallCaps(esc(i.title))}<span class="sr-only"> (opens at ${esc(host(i.url))})</span></a>`

const byline = (i) => `<p class="byline">${esc(i.publisher)}</p>`
const plate = (i, cls) =>
  i.image ? `<span class="plate ${cls}"><img class="art" src="../public${i.image}" alt="" loading="lazy" decoding="async"></span>` : ''

const leadCard = (i) => `      <article class="item lead">
        ${plate(i, 'plate-lead')}
        <div class="body">${byline(i)}
          <h2 class="head">${link(i)}</h2>
          <p class="dek">${leadIn(i.description)}</p>
        </div>
      </article>`

const feature = (i) => `        <article class="item feature">
          ${plate(i, 'plate-feature')}
          <div class="body">${byline(i)}
            <h3 class="head">${link(i)}</h3>
            <p class="dek">${leadIn(i.description)}</p>
          </div>
        </article>`

// The summary runs on after an em dash rather than opening a new block, which
// is how Techmeme fits thirty attributed items on a screen without a card.
const brief = (i) => `        <article class="item brief">
          <div class="body">${byline(i)}
            <h3 class="head">${link(i)}</h3><span class="dash" aria-hidden="true"> — </span><span class="run">${smallCaps(esc(i.description))}</span>
          </div>
        </article>`

const section = (key, label, items) => {
  const features = items.slice(0, 4).map(feature).join('\n')
  const briefs = items.slice(4).map(brief).join('\n')
  return `    <section class="section" id="${key}" aria-labelledby="${key}-name">
      <h2 class="section-name" id="${key}-name">${label}</h2>
      <div class="features">
${features}
      </div>${briefs ? `\n      <div class="briefs">\n${briefs}\n      </div>` : ''}
    </section>`
}

const lead = ed.items.find((i) => i.rank === 1)
const present = THEMES.filter(([k]) => ed.items.some((i) => i.theme === k && i.rank !== 1))

const nav = present
  .map(([k, label]) => `<li><a class="chip" href="#${k}">${label}</a></li>`)
  .join('\n        ')

const sections = present
  .map(([k, label]) => section(k, label, ed.items.filter((i) => i.theme === k && i.rank !== 1)))
  .join('\n')

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
  --read:    light-dark(#7C786F, #7B776F);

  --rule-hair:   light-dark(#DAD7D0, #2E2F33);
  --rule-strong: light-dark(#17171A, #ECEAE4);
  --edge:        light-dark(#C9C5BC, #3B3D42);

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
  font-family: Spectral, Georgia, serif;
  -webkit-font-smoothing: antialiased;
}

.sr-only {
  position: absolute; width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden;
  clip-path: inset(50%); white-space: nowrap;
}

.page { width: min(100% - 2.5rem, var(--content)); margin-inline: auto; }

.acr { font-variant-caps: all-small-caps; letter-spacing: 0.03em; }

/* ─── Masthead ───────────────────────────────────────────────────────────── */

.masthead { padding: 3rem 0 1.5rem; }

.wordmark {
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-size: 0.75rem; font-weight: 500; letter-spacing: 0.083em;
  text-transform: uppercase; color: var(--machine); margin: 0;
}

.editiondate {
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
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
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-size: 0.6875rem; font-weight: 500; letter-spacing: 0.09em;
  text-transform: uppercase; color: var(--machine); margin: 0.875rem 0 0;
}

/* Section headings are the navigation. Selected state on two visual channels
   plus aria-current, which is the cheapest correct version in the sample. */
.themes { list-style: none; display: flex; flex-wrap: wrap; gap: 1.5rem;
          margin: 1.75rem 0 0; padding: 0 0 1.25rem; }
.chip {
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-size: 0.75rem; font-weight: 500; letter-spacing: 0.083em;
  text-transform: uppercase; color: var(--machine); text-decoration: none;
  padding-bottom: 0.25rem; border-bottom: 2px solid transparent;
}
.chip:hover { color: var(--ink); border-bottom-color: var(--accent); }

/* The edition bar: which day you are reading, and the one control the product
   has. World in Brief puts its date and pager in a full-width bar above the
   column; this is the same idea with the archive's own vocabulary — dates, not
   Previous and Next, which are ambiguous under a date (later in time, or
   further back into the archive?). */
.editionbar {
  display: flex; flex-wrap: wrap; gap: 1rem 1.5rem;
  align-items: baseline; justify-content: space-between;
  margin-top: 1.5rem;
}
.days { display: flex; flex-wrap: wrap; gap: 1.25rem; align-items: baseline; }
.day {
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-size: 0.75rem; font-weight: 500; letter-spacing: 0.083em;
  text-transform: uppercase; color: var(--machine); text-decoration: none;
}
.day:hover { color: var(--ink); }
.day.is-current { color: var(--ink); }
.day.is-off { opacity: 0.45; }              /* present, not offered — never removed */
.day-all { border-bottom: 1px solid var(--rule-hair); padding-bottom: 1px; }

.ask-open {
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-size: 0.75rem; font-weight: 500; letter-spacing: 0.083em;
  text-transform: uppercase; color: var(--ink);
  background: transparent; border: 1px solid var(--rule-strong); border-radius: 0;
  padding: 0.6875rem 1rem; cursor: pointer; min-height: 44px;
}
.ask-open:hover { background: var(--ink); color: var(--paper); }

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
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-size: 0.75rem; font-weight: 500; letter-spacing: 0.083em; text-transform: uppercase;
}
.panel-title { color: var(--ink); margin: 0; }
.panel-x { color: var(--machine); background: none; border: 0; cursor: pointer;
           padding: 0.625rem; margin: -0.625rem; min-height: 44px; }
.panel-x:hover { color: var(--ink); }

.panel-body { padding: 1.5rem; overflow-y: auto; }
.panel-label { display: block; font-size: 1rem; line-height: 1.5; color: var(--prose); margin: 0 0 0.875rem; }
.panel-input {
  width: 100%; font-family: Spectral, Georgia, serif; font-size: 1.0625rem;
  color: var(--ink); background: transparent;
  border: 0; border-bottom: 1px solid var(--rule-strong); border-radius: 0;
  padding: 0.625rem 0; min-height: 44px;
}
.panel-input::placeholder { color: var(--machine); }
.panel-input:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }
.panel-note { font-size: 0.875rem; line-height: 1.55; color: var(--machine); margin: 1rem 0 0; }
.panel-examples { list-style: none; margin: 1.75rem 0 0; padding: 0; display: grid; gap: 0.5rem; }
.example {
  width: 100%; text-align: left; font-family: Spectral, Georgia, serif;
  font-size: 0.9375rem; line-height: 1.45; color: var(--prose);
  background: transparent; border: 0; border-top: 1px solid var(--rule-hair);
  padding: 0.75rem 0; cursor: pointer; min-height: 44px;
}
.example:hover { color: var(--ink); }

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
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
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
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-size: 0.6875rem; font-weight: 500; line-height: 1.4;
  letter-spacing: 0.083em; text-transform: uppercase;
  color: var(--machine); margin: 0 0 0.3125rem;
}

.head { margin: 0; font-weight: 600; }
.feature .head { font-size: 1.3125rem; line-height: 1.2; letter-spacing: -0.012em; }
.brief .head   { font-size: 1.0625rem; line-height: 1.4; display: inline; }

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
.item:has(.link:focus-visible) { outline: 2px solid var(--accent); outline-offset: 4px; }

/* ─── The end ────────────────────────────────────────────────────────────── */

.close { padding: 6rem 0 5rem; }
.close-mark {
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
  font-size: clamp(3.25rem, 9vw, 4.5rem); line-height: 0.9; letter-spacing: 0.02em;
  color: var(--accent); margin: 0 0 1.25rem -0.11em;
}
.close-sentence { font-size: 1.0625rem; line-height: 1.5; color: var(--ink); margin: 0; }
.close-next {
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
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
  .dek { max-width: none; }
}

@media (forced-colors: active) {
  .brief, .briefs { border-top: 1px solid CanvasText; }
  .section-name, .lead { border-top: 2px solid CanvasText; }
  .byline { color: GrayText; }
}

.toggle {
  position: fixed; top: 1rem; right: 1rem; z-index: 10;
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-size: 0.6875rem; letter-spacing: 0.08em; text-transform: uppercase;
  background: var(--paper); color: var(--machine);
  border: 1px solid var(--rule-hair); border-radius: 0;
  padding: 0.6rem 0.75rem; cursor: pointer; min-height: 44px;
}
</style>
</head>
<body>
<button class="toggle" onclick="const r=document.documentElement;const d=r.getAttribute('data-theme')==='dark'||(!r.getAttribute('data-theme')&&matchMedia('(prefers-color-scheme: dark)').matches);r.setAttribute('data-theme',d?'light':'dark')">Light / Dark</button>

<div class="page">
  <header class="masthead">
    <p class="wordmark">Sentinel</p>
    <h1 class="editiondate"><span class="weekday">${weekday}</span> ${dayMonth}</h1>
    <p class="manifest">${esc(ed.summary)}</p>
    <p class="promise">${ed.items.length} items · closed 09:23</p>
    <div class="editionbar">
      <nav class="days" aria-label="Editions">
        <a class="day" href="#" rel="prev">← ${prevLabel}</a>
        <span class="day is-current" aria-current="date">${dayMonth}</span>
        <span class="day is-off" aria-disabled="true">Tomorrow →</span>
        <a class="day day-all" href="#">All editions</a>
      </nav>
      <button class="ask-open" type="button" onclick="document.getElementById('ask').showModal()">Ask this archive</button>
    </div>
    <nav aria-label="Themes">
      <ul class="themes">
        ${nav}
      </ul>
    </nav>
  </header>

  <main>
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
      <ul class="panel-examples">
        <li><button type="button" class="example">Everything about the Strait of Hormuz</button></li>
        <li><button type="button" class="example">What has DeepMind announced?</button></li>
        <li><button type="button" class="example">Games news from this week</button></li>
      </ul>
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

writeFileSync(`${ROOT}/design-refs/home.html`, html)
console.log('escrito: design-refs/home.html')
console.log('lead:', lead.publisher)
for (const [k, label] of present) {
  const n = ed.items.filter((i) => i.theme === k && i.rank !== 1).length
  console.log(`  ${label.padEnd(24)} ${n} itens — ${Math.min(4, n)} destaque, ${Math.max(0, n - 4)} compacto`)
}
