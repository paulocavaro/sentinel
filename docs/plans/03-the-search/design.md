# Phase 03 — The search

Answer questions from the archive, and only from the archive. The panel has been
open since phase 02 with its field turned off and a note saying the search is the
next thing built. This is that thing.

## Problem

Sentinel holds a dated record and has no way to be asked about it. A reader who
remembers a story from a week ago can page through `/archive` by date, which is
a filing cabinet, not a question.

The hard part is not retrieval. It is refusal. The product's second principle is
that search answers only from what the archive contains, and that when nothing
matches the answer is *"there is no story about that here"* — never a plausible
answer assembled from the model's own memory. A news product that invents is
worse than one that is silent, and the reader finds out on the first thing they
check.

Everything below exists to make the invented answer structurally impossible
rather than discouraged by instruction.

## Solution

One runtime route — the site's only one — behind the `<dialog>` that already
exists.

```
reader types a question
        │
        ▼
POST /api/ask              the site's only runtime route
        │
        ├── rate limit, per IP
        │
        ├── build a MiniSearch index over content/days/*.json
        │
        ▼
   model call, Sonnet 5, effort: medium
        │
        └── tool: searchNews(query) → at most 8 items
                    │
                    ▼
        structured answer: sentences, each carrying item ids
                    │
                    ▼
        validation: every id came from this call's tool results
                    │
                    ▼
   the panel renders prose, and a dated citation per sentence
```

**The index is built on the server from `content/days/`**, through the same
`listEditionDates` / `readEdition` the pages use. A prebuilt index would save
milliseconds and introduce a second source of truth that can fall out of step
with the files actually committed — the failure this product is least able to
afford.

Built **once per instance**, not once per request. The plan review changed this
and the reasoning is worth keeping: a new edition means a push, a push means a
build, and a build means new instances — the deployment's filesystem is a
snapshot, so `content/days` cannot change under a running process. There is no
invalidation to get wrong because there is no way for the cache to go stale, and
the committed files remain the only source of truth.

**The answer is structured, never prose with markers.** The model returns
sentences, each with the ids it rests on; the component assembles the paragraph
and the `<span class="cite">` from those ids. A model that writes `[[id]]` into
free text fails silently the day it writes the marker slightly wrong. A model
that returns a malformed object fails loudly, once, at the boundary.

**A citation is a link.** `9 August` goes to `/day/2026-08-09`. The design
already argued that the answer names the day every item ran *because the whole
claim is that this is a dated record*; making it reachable is the same argument
carried one step. It also means a too-narrow answer is recoverable without
asking again.

## Chaining, and its limit

The spec said *"No conversation history — each question starts clean."* That is
changed here, deliberately, and the spec is updated with it.

What it cost: *"not that one, the other one about the same subject"* — the most
natural follow-up a reader has — is unanswerable, because nothing tells the model
what *that one* was.

**Only the questions travel. Never the answers.** A follow-up sends the previous
questions and the new one; the model uses them to write a better search query. It
does not need its own previous answer to do that, and since no assistant turn is
ever sent, there is no assistant turn a client can forge. The honesty invariant
does not rest on trusting the transcript: every answer is grounded in a **fresh**
`searchNews` call and validated against the ids *that* call returned.

**Three questions, then the series resets, silently.** Chosen over announcing it:
a line explaining the rule is a line about the software rather than about the
news, and if losing the thread turns out to confuse people it is one sentence to
add later.

The panel forgets the series when it closes. Reopening starts clean, which is
what the button promises.

## Key decisions

| Decision | Rationale |
|---|---|
| **The index is built from `content/days/`, once per instance.** | Always in step with what is committed. A build-time artefact is a second source of truth for the one product whose claim is that the files *are* the truth. The archive is immutable for an instance's lifetime, so caching it there costs no correctness. |
| **The answer is a structured object, validated against the tool's own results.** | An id the model invented cannot become a citation, because ids are checked against what `searchNews` returned on this call. Same discipline as `curate.ts`, and for the same reason. |
| **A malformed or unsupported answer is dropped whole, not repaired.** | A half-rendered answer with one citation removed reads as a complete answer. The failure has to be visible. |
| **Only previous questions are sent, never previous answers.** | Removes the forged-assistant-turn surface entirely, and the model does not need them: reformulating a query is what the questions are for. |
| **Three questions per series, reset in silence.** | Bounds cost and context without putting a rule about the software in front of the reader. |
| **Rate limited per IP, in memory.** | A public route that calls a paid model is an open cost surface; the spec bounds cost per call and nothing bounded the number of calls. In-memory rather than KV: an instance recycling and forgetting its counters is an acceptable failure for this, and a datastore is not. |
| **Sonnet 5, `effort: 'medium'`.** | `@ai-sdk/anthropic` v4 exposes `effort` as `low \| medium \| high \| xhigh \| max` through `providerOptions`, verified in the installed package rather than recalled. |
| **The answer arrives whole, not streamed.** | The output is validated before it becomes prose, and half an object cannot be validated. The design already replaced the spinner with a rule that fills — the wait has a designed state, so streaming buys nothing it does not already have. |
| **No example questions.** | The reference's three were written by hand when the archive held two editions; fixed, they age into a product whose first act is to say it does not know. A reader who opened the panel already knows what they want. |
| **Tool results are untrusted text, and the delimiter lives inside the tool's return value.** | Titles and descriptions are third-party — a Hacker News submission is literally user-supplied. `curate.ts` delimits in the prompt because the prompt string is ours; here the text arrives as a tool result whose framing belongs to the SDK, so the fence has to be built where we still own the bytes. The defences that hold: the system prompt naming tool output as quoted material, structured output that can only carry ids, and validation. |

## What the reader sees

Five states, four of them already designed and already in `app/globals.css`.

| State | Where it comes from | Design |
|---|---|---|
| Idle | the panel opens | `design-refs/home.html`, minus the examples |
| Running | the request is in flight | `states.html` 05 — `.ask-bar`, a rule that fills |
| Answered | validated sentences | `states.html` 05 — `.ask-a` with `.cite` per sentence |
| Nothing found | `searchNews` returned no items | `states.html` 06 — the most important state in the product |
| A question after a question | the second and third of a series | **not yet designed** |

The last row is this phase's only design work: the previous question and answer
recede above the new line. It is a stack of components that already exist, so it
is a new frame in `design-refs/build-states.mjs` and a new row in the screens
map — not a new visual language.

**Two dead rules follow from dropping the examples.** `.panel-examples` and
`.example` exist in `app/globals.css` because they exist in the reference. With
no examples in the product, they are rules with no user. They come out of both
files together — removing from one would break the identity that makes the visual
gate worth running.

## Failure, and what it says

| What failed | What the reader is told |
|---|---|
| Nothing matched | "Nothing about X has run in an edition. The archive holds N editions, from D." |
| The model call failed | That the search could not run, and to try again. Never a fallback answer. |
| The answer failed validation | The same. An answer that cannot be shown to rest on the archive is not shown. |
| Rate limited | That there have been too many questions, and roughly when to come back. |

The middle two are the same sentence on purpose: the difference between "the
provider was down" and "the model cited an item that does not exist" matters in
the logs and not to the reader, and describing the second honestly would mean
telling the reader the product tried to make something up.

## Out of scope

- Any change to the pipeline, the editions, or the three static routes.
- Conversation history in the ordinary sense: stored sessions, transcripts that
  outlive the panel, a series longer than three.
- Streaming the answer.
- Search as a route of its own — the spec left `/ask` open between a screen and a
  launcher, and phase 02 already resolved it as a panel.
- Semantic or vector search. MiniSearch over titles, descriptions and topics is
  what the spec names, and the corpus is a few hundred short records.
- Example questions, derived or fixed.
- Any persistence: no analytics of what was asked, no cache of answers.

## Definition of done

- Asking something the archive covers returns an answer whose every sentence
  carries a dated, linked citation, and each link reaches the day it names.
- Asking about something absent returns the refusal, naming how many editions
  the archive holds and from when.
- An answer citing an id the tool did not return is rejected before rendering,
  proven by a test that forces it.
- A second and third question in a series are understood in the light of the
  first; the fourth starts clean.
- The rate limit returns its own message rather than an error.
- The new panel state matches its reference in `design-refs/states.html`, judged
  by the visual gate at both widths and in both colour schemes.
- `docs/spec.md` no longer says each question starts clean.
- `pnpm build && pnpm typecheck && pnpm lint && pnpm test` is green.
