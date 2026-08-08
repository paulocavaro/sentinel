import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const ROOT = '/Users/pauloluiz/dev/sentinel'
const ed = JSON.parse(readFileSync(`${ROOT}/content/days/2026-08-08.json`, 'utf8'))

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const host = (u) => new URL(u).hostname.replace(/^www\./, '')

const width = (p) => {
  const m = execSync(`file -b ${JSON.stringify(`${ROOT}/public${p}`)}`).toString().match(/(\d+)x(\d+)/)
  return m ? +m[1] : 0
}

// Art appears on the lead and nowhere else. Before this rule, seven photos took
// 35% of the document's height and were selected by whether a publisher's CMS
// happens to emit a large og:image — the loudest thing on the page was chosen by
// an RSS feed. Now a photograph means "this is today's story" and nothing else.
const lead = ed.items.find((i) => i.rank === 1)
const leadArt = lead.image && width(lead.image) >= 800 ? lead.image : null

const date = new Date(`${ed.date}T12:00:00Z`)
const weekday = date.toLocaleDateString('en-GB', { weekday: 'long' })
const dayMonth = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })

const cards = ed.items
  .map((i) => {
    const n = String(i.rank).padStart(2, '0')
    const art =
      i.rank === 1 && leadArt
        ? `\n        <img class="art" src="../public${leadArt}" alt="" fetchpriority="high" decoding="async">`
        : ''
    return `      <li>
      <article class="item${i.rank === 1 ? ' is-lead' : ''}">${art}
        <span class="rank" aria-hidden="true">${n}</span>
        <div class="body">
          <p class="byline">${esc(i.publisher)}</p>
          <h2 class="head"><a class="link" href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">${esc(i.title)}<span class="sr-only"> (opens at ${esc(host(i.url))})</span></a></h2>
          <p class="desc">${esc(i.description)}</p>
        </div>
      </article>
    </li>`
  })
  .join('\n')

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sentinel, ${weekday} ${dayMonth}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&family=Spectral:wght@400;600&display=swap" rel="stylesheet">
<style>
/* ─── Sentinel · design reference ───────────────────────────────────────────
   Direction: "the record". The edition closes at 09:23, carries a date, and is
   never rewritten.

   The edition is bracketed by two large numerals: the date opens it, -20- closes
   it, same face, same margin. Everything between them stays quiet. The loudest
   thing on the page is therefore the one element guaranteed to differ every
   morning — a big wordmark goes stale by the fifth visit; a date cannot.

   Every rule below is class-based. The previous draft lost its signature to a
   descendant-selector collision that silently dropped three of four declarations
   on the mark, so no element selectors are used for anything carrying a value
   worth keeping.
   ────────────────────────────────────────────────────────────────────────── */

:root {
  --paper:   #F5F7FA;
  --ink:     #151A21;  /* 16.28:1 */
  --prose:   #39424F;  /*  9.47:1 */
  --machine: #5C6675;  /*  5.42:1 */
  --rule:    #D7DDE5;
  --accent:  #8A5D0F;  /*  5.36:1 — isoluminant with --machine */
  --read:    #6E7885;  /*  4.62:1 — a dimmed byline grey, not a browser purple */

  --measure: 34rem;
  --gutter:  2.25rem;
  color-scheme: light;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --paper:   #0F1319;
    --ink:     #E7ECF3;  /* 15.69:1 */
    --prose:   #B4BECC;  /*  9.91:1 */
    --machine: #828E9E;  /*  5.60:1 */
    --rule:    #28313E;
    --accent:  #BA8228;  /*  5.60:1 */
    --read:    #6C7787;  /*  4.55:1 */
    color-scheme: dark;
  }
}

:root[data-theme="dark"] {
  --paper:   #0F1319;
  --ink:     #E7ECF3;
  --prose:   #B4BECC;
  --machine: #828E9E;
  --rule:    #28313E;
  --accent:  #BA8228;
  --read:    #6C7787;
  color-scheme: dark;
}

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

/* ─── Masthead ───────────────────────────────────────────────────────────── */

.masthead {
  padding: 3.25rem 0 2.25rem;
  border-bottom: 1px solid var(--rule);   /* the only structural rule: the record begins */
}

.wordmark {
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-size: 0.75rem;
  font-weight: 400;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--machine);
  margin: 0 0 0 var(--gutter);
}

/* The date is the h1, not the name. The name is the same every day; this is not. */
.editiondate {
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
  font-size: clamp(2.5rem, 11vw, 3.5rem);
  font-weight: 400;
  line-height: 0.98;
  letter-spacing: -0.035em;
  color: var(--ink);
  margin: 1rem 0 0 calc(var(--gutter) - 0.055em);  /* optical hang */
}

.editiondate .weekday { display: block; color: var(--machine); }

.promise {
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-size: 0.6875rem;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--machine);
  margin: 1.125rem 0 0 var(--gutter);
}

/* ─── The edition ────────────────────────────────────────────────────────── */

.edition { list-style: none; margin: 0; padding: 0; }

/* Equal padding above and below the rule: unequal reads as a card border —
   twenty boxes, a list. Equal reads as a measure rule — one continuous column. */
.edition > li + li { border-top: 1px solid var(--rule); }

.item {
  position: relative;
  display: grid;
  grid-template-columns: var(--gutter) 1fr;
  grid-template-areas: "art art" "rank body";
  padding: 1.75rem 0;
}

.item.is-lead { padding: 2.75rem 0 3rem; }

.art {
  grid-area: art;
  width: 100%;
  aspect-ratio: 3 / 2;
  object-fit: cover;
  margin: 0 0 1.5rem;
  border: 1px solid var(--rule);
}

/* Rank is an index, not a rating: nobody reading item 14 cares that it beat 15,
   they care that six remain. It matches the byline's size and leading exactly so
   the two baselines land on the same line — the previous draft's 13px/1.55
   against 12px/1.4 is what made it look almost-but-not-quite aligned. */
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
  line-height: 1.4;
  letter-spacing: 0.06em;                  /* tracking is free: same ink, calmer texture */
  text-transform: uppercase;
  color: var(--machine);
  margin: 0 0 0.375rem;
}

.head {
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.01em;
  margin: 0;
}

.item.is-lead .head { font-size: 1.75rem; line-height: 1.18; text-wrap: balance; }
.item.is-lead .desc { font-size: 1.0625rem; }

.link { color: inherit; text-decoration: none; }

/* Block link: the whole row is the target, but the accessible name is the title
   alone. Without this a screen reader announces about forty words per card,
   beginning with a number. */
.link::after { content: ""; position: absolute; inset: 0; }
.link:visited { color: var(--read); }

.desc {
  font-size: 1rem;                         /* 16 of 20 descriptions set to exactly 3 lines */
  line-height: 1.6;
  color: var(--prose);
  margin: 0.5rem 0 0;
  text-wrap: pretty;
}

.item:hover { background: color-mix(in oklab, var(--ink) 3%, transparent); }
.item:active { background: color-mix(in oklab, var(--ink) 6%, transparent); }
@media (hover: hover) {
  .item { transition: background-color 120ms ease-out; }
  .item:active { transition: none; }       /* instant down, eased up */
}

.item:has(.link:focus-visible) { outline: 2px solid var(--accent); outline-offset: 3px; }

/* ─── The end ────────────────────────────────────────────────────────────── */

/* The mark comes first and is the largest object in the edition. It starts in
   the rank column, so it reads as the terminal member of the sequence the
   numerals just marched down, rather than an ornament under a footer rule.
   There is no border here: the ending is not another item boundary. */
.close {
  display: grid;
  grid-template-columns: var(--gutter) 1fr;
  padding: 9rem 0 7rem;
}

.close-mark {
  grid-column: 1 / -1;
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
  font-size: clamp(3.25rem, 15vw, 4.5rem);
  line-height: 0.9;
  letter-spacing: 0.02em;
  color: var(--accent);
  margin: 0 0 1.75rem -0.11em;             /* optical: the hyphen's sidebearing at this size */
}

.close-sentence {
  grid-column: 2;
  font-size: 1.0625rem;
  line-height: 1.5;
  color: var(--ink);
  margin: 0;
}

.close-next {
  grid-column: 2;
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-size: 0.6875rem;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--machine);
  margin: 0.75rem 0 0;
}

/* Fires when the mark enters the viewport. The previous draft animated on load,
   six thousand pixels from the reader, so the only motion on the page played to
   nobody every single time. Visible by default; the animation is additive. */
@media (prefers-reduced-motion: no-preference) {
  .close-mark {
    animation: settle 1ms linear both;
    animation-timeline: view();
    animation-range: entry 0% entry 60%;
  }
}
@keyframes settle { from { opacity: 0; } to { opacity: 1; } }

/* ─── Wider screens ──────────────────────────────────────────────────────── */

@media (min-width: 56rem) {
  :root { --measure: 38rem; --gutter: 3rem; }
  .head { font-size: 1.1875rem; }
  .item.is-lead .head { font-size: 2.125rem; }
}

@media (max-width: 25rem) {
  :root { --gutter: 1.875rem; }
  .head { font-size: 1.0625rem; }
  .item.is-lead .head { font-size: 1.5rem; }
  .desc { font-size: 0.9375rem; line-height: 1.55; }
}

/* The whole hierarchy rides on three greys, which collapse to one tone here. */
@media (forced-colors: active) {
  .edition > li + li { border-top: 1px solid CanvasText; }
  .byline, .rank { color: GrayText; }
}

/* ─── Review affordance only, not part of the system ─────────────────────── */
.toggle {
  position: fixed; top: 1rem; right: 1rem; z-index: 10;
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-size: 0.6875rem; letter-spacing: 0.08em; text-transform: uppercase;
  background: var(--paper); color: var(--machine);
  border: 1px solid var(--rule); border-radius: 0;
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
    <p class="promise">${ed.items.length} items · closed 09:23</p>
  </header>

  <ol class="edition">
${cards}
  </ol>

  <footer class="close">
    <p class="close-mark" aria-hidden="true">-${ed.items.length}-</p>
    <p class="close-sentence">That was ${weekday} ${dayMonth}.</p>
    <p class="close-next">Next edition 09:23 tomorrow</p>
    <span class="sr-only">End of edition. Twenty items.</span>
  </footer>
</div>
</body>
</html>
`

writeFileSync(`${ROOT}/design-refs/home.html`, html)
console.log('escrito: design-refs/home.html')
console.log('arte:', leadArt ? `sim, no rank 1 (${width(leadArt)}px)` : `nenhuma — a imagem do rank 1 tem ${lead.image ? width(lead.image) : 0}px, abaixo do corte de 800`)
