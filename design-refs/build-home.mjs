import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const ROOT = '/Users/pauloluiz/dev/sentinel'
const ed = JSON.parse(readFileSync(`${ROOT}/content/days/2026-08-08.json`, 'utf8'))

const escHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const host = (u) => new URL(u).hostname.replace(/^www\./, '')

const width = (p) => {
  const m = execSync(`file -b ${JSON.stringify(`${ROOT}/public${p}`)}`).toString().match(/(\d+)x(\d+)/)
  return m ? +m[1] : 0
}

// The Economist wraps acronyms in small-caps rather than shrinking them. Full
// caps in a serif line are luminance spikes, and a page carrying AI, API, GPU,
// EU, UN and US twenty times over is measurably noisier without this.
const smallCaps = (s) => s.replace(/\b([A-Z]{2,4})\b/g, '<span class="acr">$1</span>')

// Axios calls this an "axiom": the first words of a paragraph set in bold,
// giving a block of running text an entry point without a headline element.
const leadIn = (s) => {
  const m = s.match(/^(\S+\s+\S+)(\s+)([\s\S]*)$/)
  return m ? `<b class="lead-in">${smallCaps(escHtml(m[1]))}</b>${m[2]}${smallCaps(escHtml(m[3]))}` : smallCaps(escHtml(s))
}

const date = new Date(`${ed.date}T12:00:00Z`)
const weekday = date.toLocaleDateString('en-GB', { weekday: 'long' })
const dayMonth = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })

// The Browser titles each issue with its picks reduced to a handful of nouns,
// so the masthead doubles as a table of contents and is never the same twice.
const manifest = [...new Set(ed.items.slice(0, 9).flatMap((i) => i.topics))]
  .slice(0, 6)
  .map((t) => t[0].toUpperCase() + t.slice(1))
  .join(', ')

const artOf = (item, min) => (item.image && width(item.image) >= min ? item.image : null)

function renderItem(i, tier) {
  const n = String(i.rank).padStart(2, '0')
  const title = smallCaps(escHtml(i.title))
  const byline = `<p class="byline">${escHtml(i.publisher)}</p>`
  const link = (cls) =>
    `<a class="link ${cls}" href="${escHtml(i.url)}" target="_blank" rel="noopener noreferrer">${title}<span class="sr-only"> (opens at ${escHtml(host(i.url))})</span></a>`

  if (tier === 'lead') {
    const src = artOf(i, 800)
    const art = src
      ? `<span class="plate"><img class="art" src="../public${src}" alt="" fetchpriority="high"></span>`
      : ''
    return `      <article class="item is-lead">${art}
        <span class="rank" aria-hidden="true">${n}</span>
        <div class="body">${byline}
          <h3 class="head"><a class="link" href="${escHtml(i.url)}" target="_blank" rel="noopener noreferrer">${title}<span class="sr-only"> (opens at ${escHtml(host(i.url))})</span></a></h3>
          <p class="dek">${leadIn(i.description)}</p>
        </div>
      </article>`
  }

  if (tier === 'medium') {
    // 88px is small enough that a 140px source is not upscaled, so a thumbnail
    // from a publisher with a thin CMS still renders honestly.
    const src = artOf(i, 120)
    const art = src ? `<span class="plate plate-thumb"><img class="art" src="../public${src}" alt="" loading="lazy"></span>` : ''
    return `      <article class="item is-medium">
        <span class="rank" aria-hidden="true">${n}</span>
        <div class="body">${byline}
          <h3 class="head">${link('')}</h3>
          <p class="dek">${leadIn(i.description)}</p>
        </div>${art}
      </article>`
  }

  // Techmeme runs the summary on the same line as the headline after an em
  // dash rather than breaking it into its own block, which is how it fits
  // thirty attributed items on one screen without a single card.
  return `      <article class="item is-compact">
        <span class="rank" aria-hidden="true">${n}</span>
        <div class="body">${byline}
          <h3 class="head">${link('')}</h3><span class="dash" aria-hidden="true"> — </span><span class="dek-run">${smallCaps(escHtml(i.description))}</span>
        </div>
      </article>`
}

function renderSection(name, items) {
  const rows = items
    .map((i, idx) => renderItem(i, idx < 2 ? 'medium' : 'compact'))
    .join('\n')
  return `    <section class="section">
      <h2 class="section-name">${name}</h2>
${rows}
    </section>`
}

const lead = ed.items.find((i) => i.rank === 1)
const rest = ed.items.filter((i) => i.rank !== 1)
const ai = rest.filter((i) => i.feed.kind !== 'press' || true).filter((i) => !isWorld(i))
function isWorld(i) {
  return ['BBC', 'NPR'].includes(i.publisher) || i.topics.some((t) => ['geopolitics', 'world'].includes(t))
}
const world = rest.filter(isWorld)
const aiItems = rest.filter((i) => !isWorld(i))

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

   This pass is built on measurements taken off live editorial pages rather than
   on taste. Three findings drove it:

   1. A rule ladder, not a rule. The Athletic runs 47 hairlines at 1.33:1 AND 42
      section rules at 21:1, both 1px. Semafor ladders by style — dotted, dashed,
      solid, 2px solid. The previous draft had one rule at 1.27:1 for everything,
      which is what made twenty items read as twenty identical bands.
   2. Widen the type gap. Headline-to-dek was 1.125:1 here against 1.90:1 at
      Techmeme and 3.20:1 at Every.
   3. Change the row format mid-list. The Athletic drops thumbnails for bullets
      partway down; AP drops to a smaller tier under a rule. Peripheral vision
      registers a texture change before a word is read.
   ────────────────────────────────────────────────────────────────────────── */

:root {
  color-scheme: light dark;

  /* A tint you can name is the cheapest identity in editorial design: the FT is
     recognisable by #FFF1E5 alone. Warm paper and warm charcoal, deliberately
     neither the cream-and-terracotta nor the slate-and-mono default. */
  --paper:   light-dark(#F2F0EB, #16171A);
  --ink:     light-dark(#17171A, #ECEAE4);  /* 15.71 / 14.90 */
  --prose:   light-dark(#3D3B36, #B8B4AC);  /*  9.82 /  8.67 */
  --machine: light-dark(#6B6862, #8A867E);  /*  4.88 /  4.94 */
  --accent:  light-dark(#8A5D0F, #B07E28);  /*  5.05 /  5.00 — isoluminant with --machine */
  --read:    light-dark(#7C786F, #7B776F);

  /* The ladder. Three tiers, all 1px except the last. */
  --rule-hair:   light-dark(#DAD7D0, #2E2F33);  /* 1.26 / 1.34 — between items */
  --rule-strong: light-dark(#17171A, #ECEAE4);  /* 15.71 / 14.90 — opens a section */
  --edge:        light-dark(#C9C5BC, #3B3D42);  /* around a plate */

  --measure: 34rem;
  --gutter:  2.5rem;

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

.page {
  max-width: calc(var(--measure) + var(--gutter) + 2.5rem);
  margin: 0 auto;
  padding: 0 1.25rem;
}

.acr { font-variant-caps: all-small-caps; letter-spacing: 0.03em; }

/* ─── Masthead ───────────────────────────────────────────────────────────── */

.masthead { padding: 3rem 0 1.75rem; }

.wordmark {
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0.083em;                  /* 1px at 12px — the industry consensus */
  text-transform: uppercase;
  color: var(--machine);
  margin: 0 0 0 var(--gutter);
}

.editiondate {
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
  font-size: clamp(2.5rem, 11vw, 3.5rem);
  font-weight: 400;
  line-height: 0.98;
  letter-spacing: -0.035em;
  color: var(--ink);
  margin: 0.875rem 0 0 calc(var(--gutter) - 0.055em);
}

.editiondate .weekday { display: block; color: var(--machine); }

/* The Browser reduces each issue to a line of nouns, so the masthead doubles as
   a table of contents and is different every morning. */
.manifest {
  font-size: 1.0625rem;
  font-style: italic;
  line-height: 1.45;
  color: var(--prose);
  margin: 1.125rem 0 0 var(--gutter);
  max-width: 26em;
}

.promise {
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-size: 0.6875rem;
  font-weight: 500;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--machine);
  margin: 1rem 0 0 var(--gutter);
}

/* ─── Sections ───────────────────────────────────────────────────────────── */

.section { margin-top: 2.5rem; }

/* The strong rule. This is the single highest-value thing in the whole
   research: a 15:1 rule and a 1.26:1 rule in the same list, both 1px. */
.section-name {
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink);
  margin: 0 0 0 var(--gutter);
  padding-top: 0.75rem;
  border-top: 1px solid var(--rule-strong);
  margin-left: 0;
  padding-left: var(--gutter);
}

/* ─── Items ──────────────────────────────────────────────────────────────── */

.item {
  position: relative;
  display: grid;
  grid-template-columns: var(--gutter) 1fr;
  grid-template-areas: "plate plate" "rank body";
  align-items: start;
  padding: 1.5rem 0;
  border-top: 1px solid var(--rule-hair);
}

.section .item:first-of-type { border-top: 0; }

.rank {
  grid-area: rank;
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
  font-size: 0.75rem;
  line-height: 1.4;
  color: var(--accent);
}

.body { grid-area: body; min-width: 0; }

.byline {
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.4;
  letter-spacing: 0.083em;
  text-transform: uppercase;
  color: var(--machine);
  margin: 0 0 0.3125rem;
}

.head { margin: 0; font-weight: 600; }
.link { color: inherit; text-decoration: none; }
.link::after { content: ""; position: absolute; inset: 0; }
.link:visited { color: var(--read); }

.dek {
  font-size: 0.9375rem;
  line-height: 1.6;
  color: var(--prose);
  margin: 0.4375rem 0 0;
  text-wrap: pretty;
}

/* Axios's axiom: the entry point into a block of running text. */
.lead-in { font-weight: 600; color: var(--ink); }

/* ── Tier 1: the lead ── */
.is-lead { padding: 2rem 0 2.25rem; border-top: 0; }
.is-lead .head { font-size: clamp(1.75rem, 6.4vw, 2.25rem); line-height: 1.06; letter-spacing: -0.02em; text-wrap: balance; }
.is-lead .dek  { font-size: 1.0625rem; margin-top: 0.75rem; }

/* ── Tier 2: medium, with a plate on the right ── */
.is-medium { grid-template-columns: var(--gutter) 1fr auto; grid-template-areas: "rank body plate"; column-gap: 1rem; }
.is-medium .head { font-size: 1.25rem; line-height: 1.22; letter-spacing: -0.012em; }

/* ── Tier 3: compact, the summary running on after an em dash ── */
.is-compact { padding: 1rem 0; }
.is-compact .head { display: inline; font-size: 1.0625rem; line-height: 1.4; }
.is-compact .dash { color: var(--machine); }
.is-compact .dek-run { font-size: 1.0625rem; line-height: 1.4; color: var(--prose); }

/* ── Plates ── */
/* Twenty publishers ship twenty colour grades. Unfiltered, the photographs are
   the loudest thing on the page and they belong to nobody. A duotone in the
   accent's own family makes foreign images read as this edition's plates. */
.plate { position: relative; display: block; grid-area: plate; }
.plate::after {
  content: ""; position: absolute; inset: 0;
  background: var(--accent); mix-blend-mode: color; opacity: 0.3;
}
.plate .art { display: block; width: 100%; filter: grayscale(1) contrast(1.06); border: 1px solid var(--edge); }
.is-lead .plate { margin-bottom: 1.25rem; }
.is-lead .art { aspect-ratio: 3 / 2; object-fit: cover; }
.plate-thumb { width: 5.5rem; }
.plate-thumb .art { aspect-ratio: 1; object-fit: cover; }

.item:hover  { background: color-mix(in oklab, var(--ink) 3%, transparent); }
.item:active { background: color-mix(in oklab, var(--ink) 6%, transparent); }
@media (hover: hover) {
  .item { transition: background-color var(--dur-tap) var(--ease-out); }
  .item:active { transition: none; }
}
.item:has(.link:focus-visible) { outline: 2px solid var(--accent); outline-offset: 3px; }

/* ─── The end ────────────────────────────────────────────────────────────── */

.close { display: grid; grid-template-columns: var(--gutter) 1fr; padding: 7rem 0 6rem; }

.close-mark {
  grid-column: 1 / -1;
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
  font-size: clamp(3.25rem, 15vw, 4.5rem);
  line-height: 0.9;
  letter-spacing: 0.02em;
  color: var(--accent);
  margin: 0 0 1.5rem -0.11em;
}

.close-sentence { grid-column: 2; font-size: 1.0625rem; line-height: 1.5; color: var(--ink); margin: 0; }

.close-next {
  grid-column: 2;
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-size: 0.6875rem; font-weight: 500; letter-spacing: 0.09em; text-transform: uppercase;
  color: var(--machine); margin: 0.625rem 0 0;
}

@media (prefers-reduced-motion: no-preference) {
  .close-mark { animation: settle 1ms linear both; animation-timeline: view(); animation-range: entry 0% entry 60%; }
}
@keyframes settle { from { opacity: 0; } to { opacity: 1; } }

/* ─── Widths ─────────────────────────────────────────────────────────────── */

@media (min-width: 56rem) {
  :root { --measure: 38rem; --gutter: 3rem; }
  .is-lead .head { font-size: 2.5rem; }
}

@media (max-width: 25rem) {
  :root { --gutter: 2rem; }
  .is-medium .head { font-size: 1.1875rem; }
  .is-compact .head, .is-compact .dek-run { font-size: 1rem; }
  .plate-thumb { width: 4.5rem; }
}

@media (forced-colors: active) {
  .item { border-top: 1px solid CanvasText; }
  .section-name { border-top: 2px solid CanvasText; }
  .byline, .rank { color: GrayText; }
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
    <h1 class="editiondate"><span class="weekday">${weekday}</span>${dayMonth}</h1>
    <p class="manifest">${escHtml(manifest)}.</p>
    <p class="promise">${ed.items.length} items · closed 09:23</p>
  </header>

  <main>
${renderItem(lead, 'lead')}
${renderSection('Artificial intelligence', aiItems)}
${renderSection('The world', world)}
  </main>

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
console.log('lead:', lead.publisher, '| arte:', artOf(lead, 800) ? 'sim' : 'não (imagem pequena)')
console.log('seção IA:', aiItems.length, 'itens | seção mundo:', world.length, 'itens')
console.log('manifesto:', manifest)
