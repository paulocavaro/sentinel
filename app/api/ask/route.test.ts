// The one runtime route, exercised end to end without a model.
//
// Everything below calls `POST` with a real `Request` against a real archive on
// disk — the temp-archive pattern `app/day/[date]/page.test.tsx` established,
// for the same reason: the route's whole input is `content/days/`, and a fixture
// directory in front of `process.cwd()` is the only honest way to state it.
//
// The one thing that is faked is the model, and it is faked through the route's
// own `deps` object rather than by mocking `@/lib/search/ask`. Mocking that
// module would replace `askArchive` too — and wiring the real `askArchive` to
// the real index is the only thing this route does. A stub in place of it would
// leave the test asserting that a stub returns what the stub was told to.
//
// The tool is called by the fake generator exactly as the model would call it,
// so the citations below travel the production path: the tool fills `seen`, the
// validation reads it, and the route turns what comes back into a status code.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { edition, item, tempArchive } from '@/app/__fixtures__/archive'
import type { TempArchive } from '@/app/__fixtures__/archive'
import type { Edition, EditionItem } from '@/lib/edition'
import { MAX_QUESTIONS, MAX_QUESTION_CHARS } from '@/lib/search/ask'
import type { AskTools, Generator } from '@/lib/search/ask'
import { resetIndexForTests } from '@/lib/search/corpus'
import { MAX_IN_WINDOW, resetLimitForTests } from '@/lib/search/limit'

/**
 * The archive read, made countable — and still the real one.
 *
 * The route's fixed order of operations is the load-bearing part of this task:
 * a caller past the limit, or a body that cannot be read, must be turned away
 * *before* anything is read off disk. That property is invisible from the
 * outside — a 429 looks identical whether the archive was read first or not —
 * so the step gets a counter. `mockImplementation` keeps the real function
 * underneath, so every other test in this file still runs the production path.
 */
const { archiveIndex } = vi.hoisted(() => ({ archiveIndex: vi.fn() }))

vi.mock('@/lib/search/corpus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/search/corpus')>()
  return { ...actual, archiveIndex: archiveIndex.mockImplementation(actual.archiveIndex) }
})

const { POST, deps, maxDuration, runtime } = await import('./route')

const OPUS = '4f9c2a1b8e30'
const CABLE = '2a5f90c3d76e'

/** An id of exactly the right shape that no search in this file ever returned. */
const UNSEEN = 'ab12cd34ef56'

function day(date: string, items: EditionItem[]): Edition {
  return { ...edition(date, items.length), items }
}

const NEWEST = day('2026-08-09', [
  item({
    id: OPUS,
    title: 'Anthropic ships Claude Opus 5',
    description: 'A wider context window, and a lower price for every token in it.',
    publisher: 'Anthropic',
    topics: ['models'],
  }),
])

const OLDER = day('2026-08-08', [
  item({
    id: CABLE,
    title: 'An undersea cable is cut in the Red Sea',
    description: 'Three carriers reroute their traffic through Marseille.',
    publisher: 'Reuters',
    topics: ['infrastructure'],
  }),
])

/**
 * The options the SDK passes a tool alongside its input. None of them matter to
 * `execute`, and a tool that read `messages` would be reading the transcript
 * this product deliberately never sends.
 */
const CALL = { toolCallId: 'call-1', messages: [], context: {} }

/** Call the tool the way the model does. */
async function search(tools: AskTools, query: string): Promise<string> {
  return String(await tools.searchNews.execute({ query }, CALL))
}

/**
 * A model that searches once and cites what it found.
 *
 * The default for every case that is not about the model, so a test that is
 * about a status code says nothing about generation.
 */
const answers: Generator = async ({ tools }) => {
  await search(tools, 'Opus')
  return {
    kind: 'answer',
    sentences: [{ text: 'Anthropic shipped Claude Opus 5.', ids: [OPUS] }],
  }
}

/**
 * A request as the panel sends one.
 *
 * The address is a parameter because the rate limit buckets by it: a test that
 * wants a fresh allowance asks from a different one, and says so at the call
 * site rather than in a comment.
 */
function ask(body: unknown, ip = '203.0.113.1'): Promise<Response> {
  return POST(
    new Request('https://sentinel.test/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-real-ip': ip },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  )
}

let archive: TempArchive
const real = deps.generate

beforeEach(async () => {
  archive = await tempArchive()
  await archive.put(NEWEST)
  await archive.put(OLDER)

  // Module state that outlives a case: the index is cached for the life of an
  // instance and the limiter's counters for the life of a window, so without
  // these three the order of this file would become part of its meaning.
  resetIndexForTests()
  resetLimitForTests()
  archiveIndex.mockClear()

  deps.generate = answers
})

afterEach(async () => {
  deps.generate = real
  await archive.drop()
})

describe('POST /api/ask', () => {
  it('answers a well-formed question', async () => {
    const response = await ask({ question: 'What did Anthropic ship?' })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      kind: 'answer',
      sentences: [
        {
          text: 'Anthropic shipped Claude Opus 5.',
          // The date is the edition the item ran in, resolved out of the search
          // results — it is what makes the citation a link to a day.
          cites: [{ id: OPUS, date: '2026-08-09' }],
        },
      ],
    })
  })

  it('carries the previous questions of the series into the model call', async () => {
    const generate = vi.fn<Generator>(answers)
    deps.generate = generate

    const response = await ask({
      question: 'And what did it cost?',
      previous: ['What did Anthropic ship this week?'],
    })

    expect(response.status).toBe(200)

    const { prompt } = generate.mock.calls[0]![0]
    expect(prompt).toContain('What did Anthropic ship this week?')
    expect(prompt).toContain('And what did it cost?')
  })

  it('400s a body that is not JSON', async () => {
    // A body the panel cannot have sent. The parse throws, and a throw out of a
    // route handler is a 500 with a stack in it — so it is caught here and
    // answered with the status the request deserves.
    expect((await ask('not json at all')).status).toBe(400)
    expect((await ask('')).status).toBe(400)
  })

  it('400s a missing or empty question', async () => {
    // Whitespace is not a question. Trimming happens in the schema, so an empty
    // one cannot reach the model dressed as a short one.
    expect((await ask({})).status).toBe(400)
    expect((await ask({ question: '' })).status).toBe(400)
    expect((await ask({ question: '   ' })).status).toBe(400)
    expect((await ask({ question: 42 })).status).toBe(400)
  })

  it('400s a question past the length cap', async () => {
    expect((await ask({ question: 'q'.repeat(MAX_QUESTION_CHARS + 1) })).status).toBe(400)

    // And the cap is not the rejection of everything: one character under it is
    // a question like any other.
    expect((await ask({ question: 'q'.repeat(MAX_QUESTION_CHARS) })).status).toBe(200)
  })

  it('400s more previous questions than the series allows', async () => {
    // A series is three questions, so at most two precede the live one. The
    // panel enforces that by dropping the series on the fourth; this is the
    // copy of the rule that matters, because the array arrives over HTTP and
    // the panel is not the only thing that can post one.
    const previous = Array.from({ length: MAX_QUESTIONS }, (_, i) => `Question ${i + 1}`)

    expect((await ask({ question: 'And the next?', previous })).status).toBe(400)
    expect(
      (await ask({ question: 'And the next?', previous: previous.slice(0, MAX_QUESTIONS - 1) }))
        .status,
    ).toBe(200)
  })

  it('429s past the rate limit, with Retry-After', async () => {
    for (let i = 0; i < MAX_IN_WINDOW; i += 1) {
      expect((await ask({ question: `Question ${i}` })).status).toBe(200)
    }

    const refused = await ask({ question: 'One question too many' })

    expect(refused.status).toBe(429)
    // Seconds, and a number a client can act on: the header is what a polite
    // client obeys, the body is what the panel renders.
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0)
    // The same seconds in both places. The panel reads JSON and nothing else,
    // so a body without this number leaves it unable to name the wait — which
    // is what it did while this comment was true of the header alone.
    expect(await refused.json()).toMatchObject({
      kind: 'limited',
      retryAfter: Number(refused.headers.get('retry-after')),
    })

    // Another caller is unaffected, which is the whole point of a bucket.
    expect((await ask({ question: 'A first question' }, '198.51.100.7')).status).toBe(200)
  })

  it('spends a caller’s allowance before it reads the archive', async () => {
    for (let i = 0; i < MAX_IN_WINDOW; i += 1) await ask({ question: `Question ${i}` })
    archiveIndex.mockClear()

    expect((await ask({ question: 'One question too many' })).status).toBe(429)

    // The order is the point. Written the other way round the limiter still
    // answers 429 — and still lets whoever it is blocking make the server do
    // the work first, which is the cost the limit exists to stop.
    expect(archiveIndex).not.toHaveBeenCalled()
  })

  it('reads the body before it reads the archive', async () => {
    expect((await ask('not json at all')).status).toBe(400)
    expect((await ask({ question: '' })).status).toBe(400)

    expect(archiveIndex).not.toHaveBeenCalled()
  })

  it('500s without leaking the failure, when the model call fails', async () => {
    deps.generate = async () => {
      throw new Error('529 overloaded: key sk-ant-secret rejected by upstream')
    }

    const response = await ask({ question: 'What did Anthropic ship?' })

    expect(response.status).toBe(500)

    const body = await response.text()
    expect(body).not.toContain('529')
    expect(body).not.toContain('sk-ant-secret')
    expect(body).not.toContain('Error')
    expect(JSON.parse(body)).toMatchObject({ kind: 'failed' })
  })

  it('500s when the archive itself cannot be read', async () => {
    // The one fault `askArchive` does not absorb: it catches the model's own
    // failures and never throws, so a throw reaching the route is operational —
    // a missing directory, a disk that answered EIO — and the log is the only
    // record of it there will ever be. Forced here, because the readers swallow
    // their own I/O errors and nothing else can produce it.
    archiveIndex.mockRejectedValueOnce(new Error('EIO: /var/task/content/days'))

    const response = await ask({ question: 'What did Anthropic ship?' })

    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain('/var/task')
  })

  it('500s rather than answers when the answer cites an unseen id', async () => {
    // The phase's guarantee, seen from the outside: an answer that cites
    // something the search did not return never reaches a reader, and it is not
    // repaired into a shorter one. To the reader it is the same failure as a
    // provider outage, which is deliberate — the difference matters in the log
    // and not on the screen.
    deps.generate = async ({ tools }) => {
      await search(tools, 'Opus')
      return { kind: 'answer', sentences: [{ text: 'A cable was cut.', ids: [UNSEEN] }] }
    }

    const response = await ask({ question: 'What happened this week?' })

    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({ kind: 'failed' })
  })

  it('returns the refusal as 200, because refusing is an answer', async () => {
    // Nothing matched, and that is a correct, complete answer about a dated
    // record — not an error. The counts travel with it so the sentence the
    // panel writes can say how much was searched and from when.
    deps.generate = async ({ tools }) => {
      await search(tools, 'volcano')
      return { kind: 'nothing' }
    }

    const response = await ask({ question: 'Has anything run about volcanoes?' })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      kind: 'nothing',
      editions: 2,
      from: '2026-08-08',
    })
  })

  it('never echoes the question back in an error body', async () => {
    // A question is reader-typed text, and an error body that quotes it turns
    // the route into a reflector: whatever is posted comes back, in a response
    // some client will render. Every failure path is checked, not the
    // convenient one.
    const MARKER = '<img src=x onerror=alert(1)> zqx-marker'

    const tooLong = await ask({ question: `${MARKER} ${'q'.repeat(MAX_QUESTION_CHARS)}` })
    expect(tooLong.status).toBe(400)
    expect(await tooLong.text()).not.toContain('zqx-marker')

    deps.generate = async () => {
      throw new Error(`upstream refused the prompt: ${MARKER}`)
    }
    const failed = await ask({ question: MARKER })
    expect(failed.status).toBe(500)
    expect(await failed.text()).not.toContain('zqx-marker')

    deps.generate = answers
    for (let i = 0; i < MAX_IN_WINDOW; i += 1) await ask({ question: `Question ${i}` })
    const limited = await ask({ question: MARKER })
    expect(limited.status).toBe(429)
    expect(await limited.text()).not.toContain('zqx-marker')
  })

  it('runs on Node, for a bounded time', async () => {
    // Both are exported rather than left to a default. The handler reads the
    // archive off the filesystem, which no other runtime can do, and a tool
    // loop with no ceiling of its own would otherwise inherit the platform's
    // 300 seconds.
    expect(runtime).toBe('nodejs')
    expect(maxDuration).toBe(30)
  })
})
