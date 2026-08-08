/**
 * The single choke point for untrusted feed text.
 *
 * Every title and summary collected from a feed is attacker-writable — Hacker
 * News submissions are literally user-supplied — and every one of them reaches a
 * model prompt, the permanent archive and a public page. Nothing goes anywhere
 * without passing through `sanitizeText` first.
 */

/** The named entities that actually show up in RSS and Atom feeds. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  laquo: '«',
  raquo: '»',
  bull: '•',
  middot: '·',
  copy: '©',
  reg: '®',
  trade: '™',
  deg: '°',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  sect: '§',
  para: '¶',
  dagger: '†',
  prime: '′',
  times: '×',
  divide: '÷',
  plusmn: '±',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  eacute: 'é',
  egrave: 'è',
  agrave: 'à',
  ccedil: 'ç',
  uuml: 'ü',
  ouml: 'ö',
  auml: 'ä',
  ntilde: 'ñ',
  szlig: 'ß',
  aacute: 'á',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
}

const ENTITY = /&(#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]*);/gi

/** `<...>` including a tag broken across lines. */
const TAG = /<[^>]*>/g

/**
 * Unicode "Other": control characters (so newlines and NUL), format characters
 * (so zero-width joiners and the bidi overrides used for display spoofing),
 * surrogates, private use and unassigned code points.
 */
const CONTROL = /\p{C}/gu

const WHITESPACE = /\s+/g

function decodeOnce(input: string): string {
  return input.replace(ENTITY, (match, body: string) => {
    if (body.startsWith('#')) {
      const isHex = body[1] === 'x' || body[1] === 'X'
      const code = Number.parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10)
      // Out of range, or a lone surrogate: leave the text as it was found rather
      // than manufacture an invalid string.
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match
      if (code >= 0xd800 && code <= 0xdfff) return match
      try {
        return String.fromCodePoint(code)
      } catch {
        return match
      }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()]
    return named ?? match
  })
}

/**
 * Decode twice so `&amp;lt;script&amp;gt;` cannot survive as a live tag: one
 * pass turns it into `&lt;script&gt;`, the second into `<script>` — which is
 * then removed by tag stripping below. A single global `replace` decodes each
 * entity exactly once per pass, so the two passes are the whole budget; deeper
 * nesting is left as inert text.
 */
function decodeEntities(input: string): string {
  return decodeOnce(decodeOnce(input))
}

/**
 * Strip until the string stops changing, so a tag assembled out of the residue
 * of another (`<scr<x>ipt>`) cannot reappear after a single pass.
 */
function stripTags(input: string): string {
  let out = input
  for (let pass = 0; pass < 5; pass++) {
    const next = out.replace(TAG, ' ')
    if (next === out) break
    out = next
  }
  return out
}

/**
 * Cut at the last word boundary at or before `maxLength`. A single word longer
 * than the limit is cut hard — losing it entirely would be worse.
 */
function truncate(input: string, maxLength: number): string {
  if (input.length <= maxLength) return input

  const cut = input.slice(0, maxLength)
  const lastSpace = cut.lastIndexOf(' ')
  if (lastSpace > 0) return cut.slice(0, lastSpace)

  // A hard cut can land between the halves of a surrogate pair; drop the orphan
  // rather than emit an unpaired code unit into the archive.
  const last = cut.charCodeAt(cut.length - 1)
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut
}

/**
 * Decode entities, strip markup, flatten to a single line of collapsed
 * whitespace, then truncate on a word boundary.
 *
 * The order matters: entities are decoded *before* tags are stripped, so
 * `&lt;script&gt;` cannot slip through as text and become live markup later;
 * control characters are removed *after* tags, so a newline inside a tag cannot
 * hide it from the stripper. Removing newlines is what stops a feed title from
 * forging extra rows or a fake instruction block inside a prompt.
 */
export function sanitizeText(input: string, maxLength: number): string {
  if (typeof input !== 'string' || input.length === 0) return ''
  if (!Number.isFinite(maxLength) || maxLength <= 0) return ''

  const decoded = decodeEntities(input)
  const stripped = stripTags(decoded)
  const flattened = stripped.replace(CONTROL, ' ')
  const collapsed = flattened.replace(WHITESPACE, ' ').trim()

  return truncate(collapsed, maxLength)
}

const URL_LIKE = /https?:\/\/|\bwww\./i
const MARKUP = /<[^>]*>/
const MARKDOWN_LINK = /\]\(/

/**
 * True when the text carries a link or markup. Used to reject model-authored
 * descriptions, summaries and topics before they are written to the archive:
 * editorial prose has no reason to contain either, so anything that does is
 * either an injected payload or a mistake, and both abort the run.
 */
export function hasMarkupOrUrl(input: string): boolean {
  if (typeof input !== 'string' || input.length === 0) return false
  return URL_LIKE.test(input) || MARKUP.test(input) || MARKDOWN_LINK.test(input)
}
