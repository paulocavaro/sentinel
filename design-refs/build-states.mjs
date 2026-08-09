// Builds design-refs/states.html — the catalogue of everything the page does
// when the day is not normal. The CSS is read out of home.html rather than
// duplicated, so there is one source of truth and a state screen can never drift
// from the page it describes.

import { readFileSync, writeFileSync } from 'node:fs'

const ROOT = '/Users/pauloluiz/dev/sentinel'
const home = readFileSync(`${ROOT}/design-refs/home.html`, 'utf8')
const css = home.match(/<style>([\s\S]*?)<\/style>/)[1]
const fonts = home.match(/<link href="https:\/\/fonts[^>]*>/)[0]

const ed = JSON.parse(readFileSync(`${ROOT}/content/days/2026-08-09.json`, 'utf8'))
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const sample = ed.items[1]

const state = (n, title, why, body) => `
<section class="state">
  <div class="state-head">
    <p class="state-n">${n}</p>
    <h2 class="state-title">${title}</h2>
    <p class="state-why">${why}</p>
  </div>
  <div class="state-frame">${body}</div>
</section>`

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sentinel — states</title>
${fonts}
<style>
${css}

/* ─── Catalogue chrome. Not part of the system. ──────────────────────────── */
.cat { width: min(100% - 2.5rem, 60rem); margin-inline: auto; padding: 3rem 0 6rem; }
.cat-title { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 0.75rem;
             font-weight: 500; letter-spacing: 0.083em; text-transform: uppercase;
             color: var(--machine); margin: 0 0 0.75rem; }
.cat-lede { font-size: 1.0625rem; line-height: 1.55; color: var(--prose); margin: 0 0 3rem; max-width: 34em; }
.state { padding-top: 3.5rem; }
.state-head { border-top: 1px solid var(--rule-strong); padding-top: 0.875rem; margin-bottom: 1.5rem; }
.state-n { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 0.6875rem;
           letter-spacing: 0.09em; color: var(--accent); margin: 0 0 0.5rem; }
.state-title { font-size: 1.25rem; font-weight: 600; margin: 0; }
.state-why { font-size: 0.9375rem; line-height: 1.55; color: var(--prose); margin: 0.5rem 0 0; max-width: 46em; }
.state-frame { border: 1px solid var(--rule-hair); padding: 1.75rem; }
</style>
</head>
<body>
<div class="cat">
  <p class="cat-title">Sentinel</p>
  <h1 class="editiondate" style="font-size:2.25rem;margin:0 0 1rem">States</h1>
  <p class="cat-lede">Every condition the edition can be in that is not an ordinary day. Each one is
  designed, not improvised: the page has to say what happened in plain language, and it must never
  present stale or partial content as if it were today's.</p>

${state(
  '01',
  'Yesterday’s edition, still live',
  'The job failed, so nothing was written and the previous day stays up. The spec requires this be clearly marked. The banner is the one place the accent is spent on something other than the rank and the end mark, because it is the only genuine emergency the product has.',
  `<div class="stale-banner">
      <p class="stale-what">You are reading Saturday 8 August.</p>
      <p class="stale-why">Today&rsquo;s edition did not build. The next run is 09:23 tomorrow.</p>
    </div>
    <header class="masthead" style="padding-top:1.5rem">
      <p class="wordmark">Sentinel</p>
      <h1 class="editiondate">Saturday 8 August</h1>
      <p class="promise">20 items &middot; closed 09:23</p>
    </header>`,
)}

${state(
  '02',
  'A thin day',
  'Fewer than thirty candidates survived the window. The edition publishes anyway — a thin news day is not a failure — and says the number rather than leaving the reader to count. The end mark carries the real count, so it can never claim thirty on a day that had seventeen.',
  `<header class="masthead" style="padding-top:0">
      <p class="wordmark">Sentinel</p>
      <h1 class="editiondate">Tuesday 11 August</h1>
      <p class="promise">17 items &middot; closed 09:23 &middot; a thin day</p>
    </header>
    <footer class="close" style="padding:3rem 0 0">
      <p class="close-mark" aria-hidden="true">-17-</p>
      <p class="close-sentence">That was Tuesday 11 August. Seventeen items — the window was thin.</p>
      <p class="close-next">Next edition 09:23 tomorrow</p>
    </footer>`,
)}

${state(
  '03',
  'A day with no edition',
  'An archive date the pipeline never wrote. Not a 404 — the date is a real day and the reader asked for it by name. It says what is true and offers the nearest thing that exists.',
  `<header class="masthead" style="padding-top:0">
      <p class="wordmark">Sentinel</p>
      <h1 class="editiondate">Monday 3 August</h1>
      <p class="promise">No edition</p>
      <p class="manifest" style="font-style:normal">Nothing ran on 3 August. The job did not complete, and an edition is never written after the fact.</p>
      <nav class="days" style="margin-top:1.25rem">
        <a class="day" href="#">&larr; 2 August</a>
        <a class="day" href="#">4 August &rarr;</a>
        <a class="day day-all" href="#">Latest edition</a>
      </nav>
    </header>`,
)}

${state(
  '04',
  'An item with no photograph',
  'Roughly a third of items arrive without a usable image. The card is not a card with a hole in it — it is a card whose headline takes the space the picture would have had. The rhythm that produces is different every day and derived entirely from the day’s real data.',
  `<div class="features" style="grid-template-columns:repeat(2,minmax(0,1fr))">
      <article class="item feature">
        <span class="plate plate-feature"><img class="art" src="../public${ed.items[3].image}" alt=""></span>
        <div class="body">
          <p class="byline">${esc(ed.items[3].publisher)}</p>
          <h3 class="head"><a class="link" href="#">${esc(ed.items[3].title)}</a></h3>
          <p class="dek">${esc(ed.items[3].description)}</p>
        </div>
      </article>
      <article class="item feature">
        <div class="body">
          <p class="byline">${esc(sample.publisher)}</p>
          <h3 class="head" style="font-size:1.625rem;line-height:1.16"><a class="link" href="#">${esc(sample.title)}</a></h3>
          <p class="dek">${esc(sample.description)}</p>
        </div>
      </article>
    </div>`,
)}

${state(
  '05',
  'Asking, and being answered',
  'The panel’s three live states. Running is a rule that fills, not a spinner: a spinner says the software is busy, a rule says the archive is being read. The answer names the day every item ran, because the whole claim is that this is a dated record.',
  `<div class="panel-static">
      <p class="panel-label">Running</p>
      <div class="ask-line"><span class="ask-q">What did OpenAI ship this week?</span><span class="ask-bar"></span></div>
      <p class="panel-note">Reading 2 editions</p>
    </div>
    <div class="panel-static" style="margin-top:2rem">
      <p class="panel-label">Answered</p>
      <p class="ask-a">OpenAI paused work on its Astra model after finding it could launch cyberattacks
      on its own, and it published early cybersecurity evaluations of the same system.
      <span class="cite">9 August</span> It also acquired the presentation startup NextSlide.
      <span class="cite">9 August</span></p>
    </div>`,
)}

${state(
  '06',
  'Asking about something that is not here',
  'The most important state in the product. A news product that answers from the model’s own memory is lying about what it holds, and the reader finds out on the first thing they check. It says the limit plainly and offers nothing it cannot support.',
  `<div class="panel-static">
      <p class="panel-label">No result</p>
      <p class="ask-a">Nothing about the Formula One season has run in an edition.
      The archive holds 2 editions, from 8 August.</p>
    </div>`,
)}

</div>

<style>
/* Components introduced by the states, promoted into the system on approval. */
.stale-banner { border: 1px solid var(--accent); border-left-width: 3px; padding: 0.875rem 1.125rem; }
.stale-what { font-size: 1.0625rem; font-weight: 600; color: var(--ink); margin: 0; }
.stale-why { font-size: 0.9375rem; line-height: 1.5; color: var(--prose); margin: 0.25rem 0 0; }

.panel-static { max-width: 34em; }
.ask-line { display: flex; align-items: baseline; gap: 0.75rem; border-bottom: 1px solid var(--rule-strong); padding-bottom: 0.625rem; }
.ask-q { font-size: 1.0625rem; color: var(--ink); }
.ask-bar { flex: 1; height: 2px; background: var(--accent); opacity: 0.55; }
.ask-a { font-size: 1.0625rem; line-height: 1.6; color: var(--ink); margin: 0.5rem 0 0; }
.cite { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 0.6875rem;
        letter-spacing: 0.083em; text-transform: uppercase; color: var(--accent);
        white-space: nowrap; margin-left: 0.25rem; }
</style>
</body>
</html>
`

writeFileSync(`${ROOT}/design-refs/states.html`, html)
console.log('escrito: design-refs/states.html — 6 estados')
