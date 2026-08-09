// Builds design-refs/states.html — the catalogue of everything the page does
// when the day is not normal. The CSS is read out of home.html rather than
// duplicated, so there is one source of truth and a state screen can never drift
// from the page it describes.
//
// The whole document below is one template literal, so nothing written into it
// — markup, CSS, or a comment inside either — may contain a backtick. A CSS
// comment naming a class as `.ask-q` ends the string instead, and the failure
// arrives as a ReferenceError pointing at the middle of a stylesheet.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const home = readFileSync(`${ROOT}/design-refs/home.html`, 'utf8')
const css = home.match(/<style>([\s\S]*?)<\/style>/)[1]
const fonts = home.match(/<link href="https:\/\/fonts[^>]*>/)[0]

const ed = JSON.parse(readFileSync(`${ROOT}/content/days/2026-08-09.json`, 'utf8'))
const prevEd = JSON.parse(readFileSync(`${ROOT}/content/days/2026-08-08.json`, 'utf8'))
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// The two transforms and the three pieces of card markup, exactly as
// build-home.mjs writes them. They are duplicated rather than imported because
// that script is a top-to-bottom program with no exports — but they are
// duplicated *deliberately and identically*: the frames below used to be
// hand-written excerpts, and every place they simplified turned into a
// guaranteed false failure the moment /states was built from the real
// components. A dek here is typeset like a dek anywhere.
const host = (u) => new URL(u).hostname.replace(/^www\./, '')
const smallCaps = (s) => s.replace(/\b([A-Z]{2,4})\b/g, '<span class="acr">$1</span>')
const leadIn = (s) => {
  const m = s.match(/^(\S+\s+\S+)(\s+)([\s\S]*)$/)
  return m ? `<b class="entry">${smallCaps(esc(m[1]))}</b>${m[2]}${smallCaps(esc(m[3]))}` : smallCaps(esc(s))
}

const link = (i) =>
  `<a class="link" href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">${smallCaps(esc(i.title))}<span class="sr-only"> (opens at ${esc(host(i.url))})</span></a>`
const plate = (i, cls) =>
  i.image ? `<span class="plate ${cls}"><img class="art" src="../public${i.image}" alt="" loading="lazy" decoding="async"></span>` : ''
const feature = (i) => `<article class="item feature">
        ${plate(i, 'plate-feature')}
        <div class="body">
          <p class="byline">${esc(i.publisher)}</p>
          <h3 class="head">${link(i)}</h3>
          <p class="dek">${leadIn(i.description)}</p>
        </div>
      </article>`

// Dates the way lib/date.ts does them: parsed at noon UTC and formatted with an
// explicit UTC zone, so the reference and the app cannot disagree by a day.
const atNoon = (d) => new Date(`${d}T12:00:00Z`)
const dayMonth = (d) => atNoon(d).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long' })
const weekday = (d) => atNoon(d).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'long' })

// State 02's edition: thirty items truncated to seventeen and relabelled to a
// Tuesday. targetCount stays at thirty — it is the ceiling the edition was
// built against, and it is the whole of what makes the day thin.
const THIN_DATE = '2026-08-11'
const thin = { ...ed, date: THIN_DATE, items: ed.items.slice(0, 17) }

// State 04's pair: a real card, and a real card with its photograph removed.
const withPhoto = ed.items[3]
const withoutPhoto = { ...ed.items[1], image: null }

// State 07's earlier answer. Two items of the sample edition, their descriptions
// verbatim, each followed by the day its item ran — which is the whole shape of
// an answer from this archive. It is derived rather than typed because a
// sentence invented for the catalogue would be the one place on the site where
// the panel is shown quoting something no edition ever carried, and the frame
// exists to show the panel telling the truth twice in a row.
// `app/states/fixtures.ts` takes the same two indices out of the same file.
const FOLLOW_UP = [3, 8]
const answered = FOLLOW_UP.map(
  (n) => `${esc(ed.items[n].description)} <span class="cite">${dayMonth(ed.date)}</span>`,
).join('\n      ')

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
.cat-title { font-family: var(--face-machine); font-size: 0.75rem;
             font-weight: 500; letter-spacing: 0.083em; text-transform: uppercase;
             color: var(--machine); margin: 0 0 0.75rem; }
.cat-lede { font-size: 1.0625rem; line-height: 1.55; color: var(--prose); margin: 0 0 3rem; max-width: 34em; }
.state { padding-top: 3.5rem; }
.state-head { border-top: 1px solid var(--rule-strong); padding-top: 0.875rem; margin-bottom: 1.5rem; }
.state-n { font-family: var(--face-machine); font-size: 0.6875rem;
           letter-spacing: 0.09em; color: var(--accent); margin: 0 0 0.5rem; }
.state-title { font-size: 1.25rem; font-weight: 600; margin: 0; }
.state-why { font-size: 0.9375rem; line-height: 1.55; color: var(--prose); margin: 0.5rem 0 0; max-width: 46em; }
.state-frame { border: 1px solid var(--rule-hair); padding: 1.75rem; }
/* A framed sample is the real component, and the real components carry the
   page's own opening and closing space: .masthead opens at 3rem, .close closes
   at 6rem/5rem. Inside a frame that space belongs to the frame's padding. It is
   removed here rather than by an inline style on the sample, because a
   component cannot carry one — the catalogue is what wants the change, so the
   catalogue's own stylesheet is where it goes.
   :first-child, so state 01 — where the masthead follows the stale banner and
   opens at the 1.5rem that alert costs it — is untouched. */
.state-frame .masthead:first-child { padding-top: 0; }
.state-frame > .close { padding: 3rem 0 0; }
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
  // The masthead is the whole component, not an excerpt of it: the weekday is
  // its own span at --machine, and the manifest — the model's editorial line —
  // is between the date and the promise. Both were missing here, and both would
  // have failed /states against a page that was right.
  `<div class="stale-banner">
      <p class="stale-what">You are reading ${weekday(prevEd.date)} ${dayMonth(prevEd.date)}.</p>
      <p class="stale-why">Today&rsquo;s edition did not build. The next run is <time datetime="2026-08-10T09:23">09:23 tomorrow</time>.</p>
    </div>
    <header class="masthead" style="padding-top:1.5rem">
      <p class="wordmark">Sentinel</p>
      <h1 class="editiondate"><span class="weekday">${weekday(prevEd.date)}</span> ${dayMonth(prevEd.date)}</h1>
      <p class="manifest">${esc(prevEd.summary)}</p>
      <p class="promise">${prevEd.items.length} items &middot; closed 09:23</p>
    </header>`,
)}

${state(
  '02',
  'A thin day',
  'Fewer than thirty candidates survived the window. The edition publishes anyway — a thin news day is not a failure — and says the number rather than leaving the reader to count. The end mark carries the real count, so it can never claim thirty on a day that had seventeen.',
  // No inline padding on either block. A framed sample is the real component
  // and a component cannot carry one; the two rules that close the gap are in
  // the catalogue chrome at the top of this file.
  `<header class="masthead">
      <p class="wordmark">Sentinel</p>
      <h1 class="editiondate"><span class="weekday">${weekday(thin.date)}</span> ${dayMonth(thin.date)}</h1>
      <p class="manifest">${esc(thin.summary)}</p>
      <p class="promise">${thin.items.length} items &middot; closed 09:23 &middot; a thin day</p>
    </header>
    <footer class="close">
      <p class="close-mark" aria-hidden="true">-${thin.items.length}-</p>
      <p class="close-sentence">That was ${weekday(thin.date)} ${dayMonth(thin.date)}. Seventeen items — the window was thin.</p>
      <p class="close-next">Next edition 09:23 tomorrow</p>
      <span class="sr-only">End of edition.</span>
    </footer>`,
)}

${state(
  '03',
  'A day with no edition',
  'An archive date the pipeline never wrote. Not a 404 — the date is a real day and the reader asked for it by name. It says what is true and offers the nearest thing that exists.',
  // `NoEdition` is a route body, so it owns the page column — the frame gets
  // the `.page` wrapper the component actually renders rather than a bare
  // masthead. The nav sits in `.editionbar` for the same reason: that class is
  // the token for the space under a masthead, and the 1.25rem written here by
  // hand was an approximation of its 1.5rem, four pixels out.
  `<div class="page">
      <header class="masthead">
        <p class="wordmark">Sentinel</p>
        <h1 class="editiondate">Monday 3 August</h1>
        <p class="promise">No edition</p>
        <p class="manifest" style="font-style:normal">Nothing ran on 3 August. The job did not complete, and an edition is never written after the fact.</p>
        <div class="editionbar">
          <nav class="days" aria-label="Editions">
            <a class="day" href="/day/2026-08-02" rel="prev">&larr; 2 August</a>
            <a class="day" href="/day/2026-08-04" rel="next">4 August &rarr;</a>
            <a class="day day-all" href="/">Latest edition</a>
          </nav>
        </div>
      </header>
    </div>`,
)}

${state(
  '04',
  'An item with no photograph',
  'Roughly a third of items arrive without a usable image. The card is not a card with a hole in it — it is a card whose headline takes the space the picture would have had. The rhythm that produces is different every day and derived entirely from the day’s real data.',
  // The right-hand card carries no .plate, so the promotion comes from
  // `.feature:not(:has(.plate)) .head` in the stylesheet. It used to be an
  // inline font-size here, which meant the reference showed a rule the
  // stylesheet did not contain and what shipped was the card with the hole.
  //
  // Both cards go through `feature()` now. Written out by hand they lost the
  // lead-in bold and the small caps that every other dek on the site carries,
  // so the frame demonstrating the no-photograph rule was also, silently, a
  // frame demonstrating untypeset text.
  `<div class="features" style="grid-template-columns:repeat(2,minmax(0,1fr))">
      ${feature(withPhoto)}
      ${feature(withoutPhoto)}
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

${state(
  '07',
  'A question after a question',
  'A second question is usually a fragment that means nothing on its own, so the pair it follows stays on the page rather than being cleared. The earlier question and its answer step back a tone and sit above a hairline; the live line keeps the full weight of ink, so reading the panel from the top is reading the series in order. Nothing here is new — it is the parts of 05, stacked.',
  // The whole frame is 05's components in a different order. `.ask-q` is set as
  // a block here rather than as the span it is inside `.ask-line`, because the
  // pair that has been answered has no rule to sit on and no bar to sit beside
  // — it is two lines of finished text. The hairline and the tone are the only
  // two things `.ask-past` adds, and both are in the promoted block below.
  `<div class="panel-static">
      <p class="panel-label">Follow-up</p>
      <div class="ask-past">
        <p class="ask-q">What is happening at DeepMind?</p>
        <p class="ask-a">${answered}</p>
      </div>
      <div class="ask-line"><span class="ask-q">Who is running it now?</span><span class="ask-bar"></span></div>
      <p class="panel-note">Reading 2 editions</p>
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
.cite { font-family: var(--face-machine); font-size: 0.6875rem;
        letter-spacing: 0.083em; text-transform: uppercase; color: var(--accent);
        white-space: nowrap; margin-left: 0.25rem; }

/* State 07's earlier pair. No new part: the question and the answer are .ask-q
   and .ask-a exactly as state 05 sets them, and this only says they have been
   read.
   The tone step is to --prose, not to --machine. --machine is the layer the
   machine stamped — a byline, a count — and an answer demoted into it would be
   claiming to be furniture; --prose is where the model's editorial line already
   lives, so a past answer stays what it was and only stops being the loud one.
   The separator is the hairline, which is what this system puts between two
   things of the same kind. --rule-strong opens a section, and a series of
   questions is one thing, not a new one each time. */
.ask-past { border-bottom: 1px solid var(--rule-hair); padding-bottom: 1.25rem; margin-bottom: 1.25rem; }
.ask-past .ask-q { display: block; margin: 0; color: var(--prose); }
.ask-past .ask-a { color: var(--prose); }
</style>
</body>
</html>
`

writeFileSync(`${ROOT}/design-refs/states.html`, html)
console.log('written: design-refs/states.html — 7 states')
