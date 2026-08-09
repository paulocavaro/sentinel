import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { dayMonth } from '@/lib/date'

import { AskBody, AskPanel, ask, carry } from './AskPanel'
import type { Exchange, Live } from './AskPanel'

// The panel, rendered rather than driven.
//
// `renderToStaticMarkup` is the house pattern — `EditionBar.test.tsx`,
// `Item.test.tsx`, `lib/typeset.test.tsx` — and the suite has no DOM at all
// (`vitest.config.mts` keeps `environment: 'node'` on purpose). So this file
// tests the three seams the panel is built out of rather than clicking it:
//
//   · `AskBody` renders one state, given that state. It is exported for exactly
//     this reason, and it is where every markup assertion below lands.
//   · `carry` is the series rule — what stays above the new question, and what
//     the fourth question drops.
//   · `ask` is the request, over a stubbed `fetch`, and the assertion that only
//     questions travel is made on the body it posts.
//
// The classes are asserted, not the prose, because the class names are the
// contract with `app/globals.css`: `.ask-line`, `.ask-bar`, `.ask-a`, `.cite`
// and `.ask-past` are what `design-refs/states.html` frames 05, 06 and 07 draw,
// and a rename here silently unstyles a state nobody screenshots.

const html = renderToStaticMarkup
const nothing = () => {}

// Two sentences, two outlets, two hosts. Nothing below would notice a citation
// resolved against the wrong item if both carried the same publisher or the same
// link, and the fields being crossed is the whole failure this shape can have.
const GUARDIAN = {
  id: 'a1',
  date: '2026-08-09',
  url: 'https://www.theguardian.com/technology/2026/aug/09/deepmind-weather-model',
  publisher: 'The Guardian',
}
const ARS = {
  id: 'b2',
  date: '2026-08-08',
  url: 'https://arstechnica.com/2026/08/08/deepmind-head-of-research-departs/',
  publisher: 'Ars Technica',
}

const DEEPMIND: Exchange = {
  kind: 'answered',
  question: 'What is happening at DeepMind?',
  sentences: [
    {
      text: 'DeepMind published its weather model as a paper rather than a product.',
      cites: [GUARDIAN],
    },
    {
      text: 'Its head of research left for a startup the same week.',
      cites: [ARS],
    },
  ],
}

// The whole citation, asserted as one string: the outlet, the separator, the
// day, and the link they hang on. Written out rather than matched loosely
// because the label and the destination have to agree — a `.cite` reading
// "9 August" over a link to techcrunch.com is the bug this shape exists to
// prevent, and two `toContain`s on the parts would pass with them crossed.
//
// The day goes through `dayMonth` rather than the literal "9 August".
// `dayMonth` prints the year outside the current one, so a hard-coded string
// would turn this suite red on 1 January for a component that had not changed.
// What is being tested is that the citation goes through the same formatter the
// edition bar does; `lib/date.test.ts` owns what that formatter prints.
const cite = (c: { date: string; url: string; publisher: string }) =>
  `<a class="cite" href="${c.url}" target="_blank" rel="noopener noreferrer">` +
  `${c.publisher} · ${dayMonth(c.date)}</a>`

describe('AskPanel', () => {
  it('renders the idle field, enabled, with the reference placeholder', () => {
    const idle = html(<AskPanel ref={null} editions={2} />)

    expect(idle).toContain('placeholder="What did OpenAI ship this week?"')
    expect(idle).toContain('class="panel-input"')
    // Phase 02 shipped this field turned off because there was nothing behind
    // it. There is now, and the whole task is that the attribute is gone.
    expect(idle).not.toContain('disabled')
  })

  it('opens with nothing above the field, because a fresh panel has no series', () => {
    const idle = html(<AskPanel ref={null} editions={2} />)

    expect(idle).not.toContain('ask-past')
    expect(idle).not.toContain('ask-line')
    expect(idle).not.toContain('ask-a')
  })
})

describe('AskBody', () => {
  // Every state below is asked for at two editions, which is what the archive
  // held when the reference was drawn. The count only reaches the running note,
  // and the tests that are about the count say so in their names.
  const RUNNING: Live = { kind: 'running', question: 'Who is running it now?' }

  it('renders the question and the filling rule while in flight', () => {
    const running = html(<AskBody past={[]} live={RUNNING} onAsk={nothing} editions={2} />)

    // Frame 05's running block, to the attribute.
    expect(running).toContain(
      '<div class="ask-line"><span class="ask-q">Who is running it now?</span><span class="ask-bar"></span></div>',
    )
  })

  // The reference puts the live line where the field is: one slot, holding
  // either the question being asked or the question being answered.
  it('takes the field away while the question is in flight', () => {
    const running = html(<AskBody past={[]} live={RUNNING} onAsk={nothing} editions={2} />)

    expect(running).not.toContain('panel-input')
  })

  // The running note is the reference's own sentence — "Reading 2 editions",
  // frames 05 and 07 — and the number is a prop because the browser has no way
  // to count the archive. This is the whole reason `editions` is threaded down
  // from `EditionPage` and `app/archive/page.tsx`, both of which already hold
  // `listEditionDates()`. A closed dialog is in no screenshot, so the visual
  // gate can never catch this sentence drifting; these three tests are the only
  // thing standing between it and "Reading the archive" coming back.
  it('names how many editions it is reading while the question is in flight', () => {
    const running = html(<AskBody past={[]} live={RUNNING} onAsk={nothing} editions={2} />)

    expect(running).toContain('Reading 2 editions')
  })

  it('reads one edition in the singular', () => {
    const running = html(<AskBody past={[]} live={RUNNING} onAsk={nothing} editions={1} />)

    expect(running).toContain('Reading 1 edition')
    expect(running).not.toContain('1 editions')
  })

  // A clone with nothing ingested yet. "Reading 0 editions" is a number that
  // undercuts the sentence it is in, so the fallback names the archive instead
  // — honest, and the reason the number is worth a prop rather than a guess.
  it('falls back to reading the archive when it holds no editions', () => {
    const running = html(<AskBody past={[]} live={RUNNING} onAsk={nothing} editions={0} />)

    expect(running).toContain('Reading the archive')
    expect(running).not.toContain('0 edition')
  })

  it('renders one .cite per sentence, naming the outlet and linking at the article', () => {
    const answered = html(<AskBody past={[]} live={DEEPMIND} onAsk={nothing} editions={2} />)

    expect(answered).toContain('<p class="ask-a">')
    expect(answered).toContain(cite(GUARDIAN))
    expect(answered).toContain(cite(ARS))
    expect(answered).toContain('DeepMind published its weather model')
    // The edition page is where the citation used to land, and landing there is
    // what made the reader hunt for the story among thirty items.
    expect(answered).not.toContain('href="/day/')
  })

  // The citation leaves the site, so it carries the two attributes every
  // outbound link in this repository carries. `noopener` is the one that
  // matters: without it the publisher's page can reach back through
  // `window.opener` and navigate the archive out from under the reader.
  it('opens the article in a new tab, and severs the opener', () => {
    const answered = html(<AskBody past={[]} live={DEEPMIND} onAsk={nothing} editions={2} />)

    expect(answered).toContain('target="_blank" rel="noopener noreferrer"')
  })

  // The rule this replaced collapsed citations by date, which was right while
  // `.cite` printed a day and nothing else. Now that it prints a story, two
  // items from one edition are two sources — and dropping the second would take
  // a claim's second leg off the page while leaving the claim.
  it('prints one citation per item, even when both ran on the same day', () => {
    const sameDay = { ...ARS, id: 'a2', date: GUARDIAN.date }
    const twice: Live = {
      kind: 'answered',
      question: 'What did DeepMind do?',
      sentences: [{ text: 'It did two things.', cites: [GUARDIAN, sameDay] }],
    }

    const answered = html(<AskBody past={[]} live={twice} onAsk={nothing} editions={2} />)

    expect(answered.split('class="cite"')).toHaveLength(3)
    expect(answered).toContain(cite(GUARDIAN))
    expect(answered).toContain(cite(sameDay))
  })

  // The same item named twice is not a second source, and `seen` resolves both
  // copies to the same article — so this is the identical-link-in-a-row case,
  // and the only one the de-duplication is still for.
  it('prints one citation when a sentence names the same item twice', () => {
    const doubled: Live = {
      kind: 'answered',
      question: 'What did DeepMind do?',
      sentences: [{ text: 'It did one thing.', cites: [GUARDIAN, { ...GUARDIAN }] }],
    }

    expect(
      html(<AskBody past={[]} live={doubled} onAsk={nothing} editions={2} />).split('class="cite"'),
    ).toHaveLength(2)
  })

  it('renders the refusal, naming how many editions and from when', () => {
    const refused = html(
      <AskBody
        past={[]}
        live={{ kind: 'nothing', question: 'What about Formula One?', editions: 2, from: '2026-08-08' }}
        onAsk={nothing}
        editions={2}
      />,
    )

    // Frame 06: the refusal is an answer about the archive, so it is `.ask-a`
    // at full ink and not a note about the software.
    expect(refused).toContain('<p class="ask-a">')
    expect(refused).toContain('Nothing about that has run in an edition.')
    expect(refused).toContain(`The archive holds 2 editions, from ${dayMonth('2026-08-08')}.`)
    expect(refused).not.toContain('class="cite"')
  })

  it('counts one edition in the singular', () => {
    const refused = html(
      <AskBody
        past={[]}
        live={{ kind: 'nothing', question: 'What about Formula One?', editions: 1, from: '2026-08-08' }}
        onAsk={nothing}
        editions={1}
      />,
    )

    expect(refused).toContain('The archive holds 1 edition, from')
  })

  // A fresh clone answers `{ editions: 0, from: '' }`. "The archive holds 0
  // editions, from " is not a sentence, and `dayMonth('')` throws. The state's
  // own `editions` is the route's count, counted when the question was asked;
  // the prop is the page's, counted when the page was built. They agree here
  // because a fresh clone has nothing either of them could disagree about.
  it('says the archive is empty rather than dating nothing', () => {
    const refused = html(
      <AskBody
        past={[]}
        live={{ kind: 'nothing', question: 'What about Formula One?', editions: 0, from: '' }}
        onAsk={nothing}
        editions={0}
      />,
    )

    expect(refused).toContain('The archive holds no editions yet.')
    expect(refused).not.toContain('from .')
    expect(refused).not.toContain('0 editions')
  })

  it('renders the failure sentence, and offers to try again', () => {
    const failed = html(
      <AskBody
        past={[]}
        live={{ kind: 'failed', question: 'What about DeepMind?' }}
        onAsk={nothing}
        editions={2}
      />,
    )

    // The note, not `.ask-a`: a failure is the software talking about itself,
    // and dressing it as an answer puts it in the voice that answers.
    expect(failed).toContain('<p class="panel-note"')
    expect(failed).toContain('The search could not run. Try again.')
    expect(failed).not.toContain('class="ask-a"')
    // Offering to try again means the field is there to try in.
    expect(failed).toContain('class="panel-input"')
  })

  // The wait is the route's, in seconds, and the sentence is in whole minutes:
  // a reader told "43 seconds" watches a clock, and one told nothing at all
  // learns nothing. `retryAfter` rides on the state rather than being fetched
  // again, which is why the limited member carries a number of its own.
  it('renders the rate-limit sentence, naming the wait in whole minutes', () => {
    const limited = html(
      <AskBody
        past={[]}
        live={{ kind: 'limited', question: 'What about DeepMind?', retryAfter: 120 }}
        onAsk={nothing}
        editions={2}
      />,
    )

    expect(limited).toContain('<p class="panel-note"')
    expect(limited).toContain('Too many questions from here. Try again in about 2 minutes.')
    // The rate limit is a wait, not a failure: the field stays so the reader
    // can ask the moment the wait is over.
    expect(limited).toContain('class="panel-input"')
  })

  // Rounded up, both ways. 43 seconds rounded down is "0 minutes"; 61 seconds
  // rounded down is "1 minute", which sends the reader back a second early into
  // the same refusal. The minute is only ever spent early by the reader.
  it('rounds a part minute up, and says one minute in the singular', () => {
    const limited = (retryAfter: number) =>
      html(
        <AskBody
          past={[]}
          live={{ kind: 'limited', question: 'What about DeepMind?', retryAfter }}
          onAsk={nothing}
          editions={2}
        />,
      )

    expect(limited(43)).toContain('Try again in about 1 minute.')
    expect(limited(61)).toContain('Try again in about 2 minutes.')
  })

  // Zero is what `ask` returns when the 429 body carried no number, so this is
  // the sentence for a rate limit the panel cannot put a clock on. Naming a
  // wrong number would be worse than naming none.
  it('names no time at all when the wait is unknown', () => {
    const limited = html(
      <AskBody
        past={[]}
        live={{ kind: 'limited', question: 'What about DeepMind?', retryAfter: 0 }}
        onAsk={nothing}
        editions={2}
      />,
    )

    expect(limited).toContain('Too many questions from here. Try again shortly.')
    expect(limited).not.toContain('minute')
  })

  it('keeps the earlier pair above the new question', () => {
    const series = html(
      <AskBody past={[DEEPMIND]} live={RUNNING} onAsk={nothing} editions={2} />,
    )

    // Frame 07: the earlier question and its answer, stepped back behind a
    // hairline, with the live line under them.
    expect(series).toContain(
      '<div class="ask-past"><p class="ask-q">What is happening at DeepMind?</p><p class="ask-a">',
    )
    expect(series.indexOf('ask-past')).toBeLessThan(series.indexOf('ask-line'))
  })

  // The answer quotes titles and descriptions written by other people and has
  // been through a model on the way here. React escapes by default; this is the
  // assertion that nothing in this file ever stops it.
  //
  // The citation is the same surface and is now two more of it. A publisher name
  // is whatever the feed says it is, and it is printed inside the link; the url
  // is whatever the feed says it is, and it is printed into an attribute — where
  // a single unescaped quote closes the tag and everything after it is markup.
  // Both carry a payload here.
  it('escapes markup in an answer, because the answer quotes third parties', () => {
    const hostile: Live = {
      kind: 'answered',
      question: 'What did they say?',
      sentences: [
        {
          text: '<script>alert("x")</script> & <img src=x onerror=alert(1)>',
          cites: [
            {
              id: 'a1',
              date: '2026-08-09',
              url: 'https://example.com/a?q="><script>alert(1)</script>&b=2',
              publisher: '<img src=x onerror=alert(1)> & "Reuters"',
            },
          ],
        },
      ],
    }

    const answered = html(<AskBody past={[]} live={hostile} onAsk={nothing} editions={2} />)

    expect(answered).not.toContain('<script>')
    expect(answered).not.toContain('<img')
    expect(answered).toContain('&lt;script&gt;')
    expect(answered).toContain('&amp;')
    // The quote that would have ended `href="` had it survived.
    expect(answered).toContain('&quot;')
    // And the link is still one tag: the payload did not open a second one.
    expect(answered.split('<a ')).toHaveLength(2)
  })
})

describe('carry', () => {
  const asked = (question: string): Exchange => ({ ...DEEPMIND, question })

  it('keeps the answered pair on screen when the next question is asked', () => {
    expect(carry([], asked('one')).map((exchange) => exchange.question)).toEqual(['one'])
  })

  it('keeps both earlier pairs for the third question', () => {
    expect(carry([asked('one')], asked('two')).map((exchange) => exchange.question)).toEqual([
      'one',
      'two',
    ])
  })

  // MAX_QUESTIONS is three, and the fourth starts clean — silently, because a
  // line explaining the rule is a line about the software rather than the news.
  it('starts clean on the fourth question', () => {
    expect(carry([asked('one'), asked('two')], asked('three'))).toEqual([])
  })

  // A question that failed was never answered, so there is no pair to keep and
  // nothing about it for the model to be told.
  it('carries nothing forward from a question that failed', () => {
    expect(carry([], { kind: 'failed', question: 'one' })).toEqual([])
    expect(
      carry([asked('one')], { kind: 'limited', question: 'two', retryAfter: 120 }).map(
        (e) => e.question,
      ),
    ).toEqual(['one'])
  })

  it('carries nothing forward from an idle panel', () => {
    expect(carry([], { kind: 'idle' })).toEqual([])
  })
})

describe('ask', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function reply(body: unknown, init?: ResponseInit) {
    const fetch = vi.fn(async () => Response.json(body, init))
    vi.stubGlobal('fetch', fetch)
    return fetch
  }

  // The phase's chaining rule, asserted on the bytes that leave the browser.
  it('sends the question and the earlier questions, and never an answer', async () => {
    const fetch = reply({ kind: 'nothing', editions: 2, from: '2026-08-08' })

    await ask('Who is running it now?', ['What is happening at DeepMind?'])

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/ask')
    expect(JSON.parse(String(init.body))).toEqual({
      question: 'Who is running it now?',
      previous: ['What is happening at DeepMind?'],
    })
    expect(String(init.body)).not.toContain('sentences')
    expect(String(init.body)).not.toContain('cites')
  })

  it('turns an answer into the answered state, keeping the question with it', async () => {
    reply({ kind: 'answer', sentences: DEEPMIND.sentences })

    expect(await ask('What is happening at DeepMind?', [])).toEqual(DEEPMIND)
  })

  it('turns the refusal into the state that names the archive', async () => {
    reply({ kind: 'nothing', editions: 2, from: '2026-08-08' })

    expect(await ask('What about Formula One?', [])).toEqual({
      kind: 'nothing',
      question: 'What about Formula One?',
      editions: 2,
      from: '2026-08-08',
    })
  })

  // The wait is read out of the *body*, not out of `Retry-After`. Both carry
  // it, and reading a header would be the one place this function touched the
  // response as anything other than JSON — the route puts the number in the
  // body precisely so the panel does not have to.
  it('reads a 429 as the rate limit, and takes the wait off the body', async () => {
    reply({ kind: 'limited', message: 'Too many questions.', retryAfter: 137 }, { status: 429 })

    expect(await ask('What about DeepMind?', [])).toEqual({
      kind: 'limited',
      question: 'What about DeepMind?',
      retryAfter: 137,
    })
  })

  // Zero rather than a guess: it is the one value the note reads as "no number
  // arrived", and it prints "shortly" instead of inventing a minute.
  it('waits no stated time when the 429 body carries no number', async () => {
    reply({ kind: 'limited', message: 'Too many questions.' }, { status: 429 })

    expect(await ask('What about DeepMind?', [])).toEqual({
      kind: 'limited',
      question: 'What about DeepMind?',
      retryAfter: 0,
    })
  })

  // A 429 the route never wrote — a CDN or a proxy shedding load answers with
  // its own HTML page. It is still a rate limit and still the sentence about
  // asking too much, so the parse failure is swallowed rather than demoted to
  // the generic failure state.
  it('stays a rate limit when the 429 body is not JSON at all', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>429 Too Many Requests</html>', { status: 429 })),
    )

    expect(await ask('What about DeepMind?', [])).toEqual({
      kind: 'limited',
      question: 'What about DeepMind?',
      retryAfter: 0,
    })
  })

  it('reads any other error status as a failure', async () => {
    reply({ kind: 'failed', message: 'The search could not run.' }, { status: 500 })

    expect(await ask('What about DeepMind?', [])).toEqual({
      kind: 'failed',
      question: 'What about DeepMind?',
    })
  })

  // A dropped connection, a page navigating away, a proxy answering with HTML.
  // The reader is told the same thing for all of them, and nothing throws out
  // of the promise the panel is waiting on.
  it('fails rather than throws when the request never lands', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )

    expect(await ask('What about DeepMind?', [])).toEqual({
      kind: 'failed',
      question: 'What about DeepMind?',
    })
  })
})
