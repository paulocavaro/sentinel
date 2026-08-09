// Small numbers, spelled.
//
// One sentence in the product needs this: the close block on a thin day —
// "Seventeen items — the window was thin." — per design-refs/states.html state
// 02. A newspaper spells a count under a hundred in running prose and prints
// the digit in a label, which is exactly the split the page already has: the
// masthead's `.promise` is a machine-face label and says `17 items`, the
// closing sentence is prose and says `Seventeen`.
//
// It lives here rather than in lib/typeset.tsx because that module is the
// tokenizer pair mirroring design-refs/build-home.mjs character for character
// and returns React nodes; this returns a string and has no counterpart in the
// generator. It is a lookup rather than an algorithm because the ceiling is
// `TARGET_COUNT`, thirty: an edition can never carry more items than the target
// it was built against, so the table is the whole domain. That is also why
// there is no dependency here — a number-to-words package would be tens of
// kilobytes to cover a range this file covers in one line.

const WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
  'twenty-one',
  'twenty-two',
  'twenty-three',
  'twenty-four',
  'twenty-five',
  'twenty-six',
  'twenty-seven',
  'twenty-eight',
  'twenty-nine',
  'thirty',
] as const

/**
 * `17` → `seventeen`, lowercase, for prose.
 *
 * Anything outside the table — a negative, a fraction, or a count above the
 * target, none of which the archive can produce — falls back to the digits.
 * A sentence reading "37 items — the window was thin" is wrong about the day
 * but still a sentence; a thrown error at build time would take the site down
 * over a word.
 */
export function inWords(count: number): string {
  return Number.isInteger(count) && count >= 0 && count < WORDS.length
    ? WORDS[count]
    : String(count)
}

/** First letter up, the rest untouched: `inWords` is lowercase and the closing sentence opens with it. */
export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
