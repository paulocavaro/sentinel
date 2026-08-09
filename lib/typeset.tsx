// Typesetting for model-authored and publisher-authored text.
//
// design-refs/build-home.mjs does the same two transforms with string
// replacement, because that script writes an HTML file. Here they are
// tokenizers that return React nodes. The regexes are the generator's,
// character for character, so the app and the reference set the same text —
// that identity is what the visual gate compares. What is deliberately not
// carried over is the string return: a function handing back `<span …>` as text
// is the one shape that invites dangerouslySetInnerHTML, and this is the
// codebase's largest surface of text nobody here wrote.

import type { ReactNode } from 'react'

// Two to four letters, on word boundaries: AI, US, UK, ICC, NASA. Five or more
// (TECHCRUNCH) has no boundary after the fourth letter and is left alone, and
// the AI in OpenAI has no boundary before it, so mixed-case names survive.
const ACRONYM = /\b([A-Z]{2,4})\b/g

// The first two words, the whitespace after them, and the rest — kept as three
// captures so the original spacing is reproduced rather than normalised.
const LEAD_IN = /^(\S+\s+\S+)(\s+)([\s\S]*)$/

/**
 * Small caps on short uppercase runs. Returns the string untouched when nothing
 * matches, and an array of strings and `<span class="acr">` elements when
 * something does — never markup as text.
 */
export function smallCaps(text: string): ReactNode {
  const out: ReactNode[] = []
  let cut = 0

  // matchAll builds its own regex from this one, so the shared lastIndex of a
  // module-level global regex is not a hazard here.
  for (const match of text.matchAll(ACRONYM)) {
    const at = match.index ?? 0
    if (at > cut) out.push(text.slice(cut, at))
    out.push(
      <span className="acr" key={at}>
        {match[1]}
      </span>,
    )
    cut = at + match[1].length
  }

  if (out.length === 0) return text
  if (cut < text.length) out.push(text.slice(cut))
  return out
}

/**
 * The first two words in bold, the rest as it was, small caps throughout. A
 * string of fewer than three words has no lead-in and gets small caps alone.
 */
export function leadIn(text: string): ReactNode {
  const match = text.match(LEAD_IN)
  if (!match) return smallCaps(text)

  return (
    <>
      <b className="entry">{smallCaps(match[1])}</b>
      {match[2]}
      {smallCaps(match[3])}
    </>
  )
}

/**
 * The publisher line. **No typesetting is applied, on purpose.** `.byline`
 * carries `text-transform: uppercase`, so small caps on top would set CNN at
 * x-height next to a full-size TECHCRUNCH — a regression this repo has already
 * shipped once.
 *
 * The publisher goes through this component rather than through bare markup so
 * there is a named right answer to reach for; and `children` is typed `string`,
 * not ReactNode, so `<Byline>{smallCaps(publisher)}</Byline>` does not compile.
 */
export function Byline({ children }: { children: string }) {
  return <p className="byline">{children}</p>
}
