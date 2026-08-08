import { lookup } from 'node:dns/promises'

/**
 * The SSRF guard and the byte cap.
 *
 * Everything downstream of this module fetches URLs that came verbatim out of
 * an untrusted feed — an article page for its `og:image`, then the image
 * itself. Hacker News submissions make those URLs attacker-*chosen* by design,
 * and the fetch happens inside a GitHub Actions runner holding a
 * `contents: write` token. Without a guard, `http://169.254.169.254/`,
 * `http://localhost:8080/` and a 2 GB "image" are all one feed entry away.
 *
 * Two functions, both used by every remote read in the pipeline:
 *
 * - `assertSafeUrl` — https only, no credentials, and no address in private,
 *   loopback, link-local or otherwise reserved space, whether it was written
 *   into the URL as a literal or arrived through DNS.
 * - `fetchBounded` — a hard byte cap enforced over the stream rather than over
 *   the headers, a content-type allowlist, and manual redirect following so
 *   every hop is re-validated.
 *
 * ---------------------------------------------------------------------------
 * KNOWN GAP — DNS rebinding / TOCTOU. READ BEFORE TRUSTING THIS MODULE.
 * ---------------------------------------------------------------------------
 * `assertSafeUrl` resolves the hostname and checks the answers. `fetch` then
 * resolves the hostname *again*, independently, and connects to whatever it
 * gets. Those are two separate lookups, and nothing here forces them to agree.
 * An attacker who controls a DNS zone can answer the first with a public
 * address and the second — moments later, or from a different cache — with
 * `169.254.169.254`. A short TTL is all it takes; the technique is ordinary.
 *
 * **This module does not close that gap and cannot.** Closing it means owning
 * the socket: a custom `undici` Agent with a `connect` hook that re-checks the
 * peer address after the TCP connection is established and before any bytes are
 * written, or resolving once here and connecting to the literal IP with an
 * explicit SNI/Host header. Either is a real piece of work and neither is in
 * this phase.
 *
 * What the check *does* buy, and why it is still worth having: it stops every
 * non-adaptive case, which is all of them until someone targets this pipeline
 * specifically — a feed that links `http://localhost:8080/`, a shortener that
 * lands on `10.0.0.5`, a literal metadata IP, a redirect into private space,
 * an ordinary hostname that happens to have an internal A record. It is a
 * filter, not a boundary. Do not read a passing `assertSafeUrl` as proof that
 * the socket went somewhere public, and do not let anything with real
 * privileges downstream of it assume otherwise.
 */

/** A URL that must not be fetched. Never contains response data. */
export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsafeUrlError'
  }
}

/** A response that broke the size, type or redirect budget. */
export class FetchLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FetchLimitError'
  }
}

export type ResolvedAddress = { address: string; family: number }

/** Injected everywhere so no test ever performs a real lookup. */
export type DnsResolver = (hostname: string) => Promise<ResolvedAddress[]>

/** Injected everywhere so no test ever opens a socket. */
export type FetchImpl = (url: string, init: RequestInit) => Promise<Response>

/** The real resolver. Imported by no test. */
export const defaultResolver: DnsResolver = async (hostname) => {
  const answers = await lookup(hostname, { all: true, verbatim: true })
  return answers.map((a) => ({ address: a.address, family: a.family }))
}

// ---------------------------------------------------------------------------
// Address classification
// ---------------------------------------------------------------------------

type Cidr = readonly [bytes: readonly number[], prefixLength: number]

/**
 * IPv4 space that must never be reached from the ingest runner.
 *
 * Wider than "private": link-local carries the cloud metadata endpoint on every
 * major provider, carrier-grade NAT is shared infrastructure, and the
 * documentation/benchmark blocks have no business answering a request at all.
 */
const BLOCKED_V4: readonly Cidr[] = [
  [[0, 0, 0, 0], 8], // "this network"
  [[10, 0, 0, 0], 8], // RFC1918
  [[100, 64, 0, 0], 10], // carrier-grade NAT
  [[127, 0, 0, 0], 8], // loopback
  [[169, 254, 0, 0], 16], // link-local — the cloud metadata endpoint lives here
  [[172, 16, 0, 0], 12], // RFC1918
  [[192, 0, 0, 0], 24], // IETF protocol assignments
  [[192, 0, 2, 0], 24], // TEST-NET-1
  [[192, 88, 99, 0], 24], // 6to4 relay anycast
  [[192, 168, 0, 0], 16], // RFC1918
  [[198, 18, 0, 0], 15], // benchmarking
  [[198, 51, 100, 0], 24], // TEST-NET-2
  [[203, 0, 113, 0], 24], // TEST-NET-3
  [[224, 0, 0, 0], 4], // multicast
  [[240, 0, 0, 0], 4], // reserved, including 255.255.255.255
]

const BLOCKED_V6: readonly Cidr[] = [
  [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 128], // unspecified
  [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], 128], // ::1 loopback
  [[0x01, 0], 16], // 0100::/8 discard-only
  [[0x20, 0x01, 0, 0], 32], // Teredo — tunnels an embedded IPv4
  [[0x20, 0x01, 0x0d, 0xb8], 32], // documentation
  [[0xfc, 0], 7], // fc00::/7 unique-local
  [[0xfe, 0x80], 10], // fe80::/10 link-local
  [[0xfe, 0xc0], 10], // fec0::/10 site-local (deprecated, still routed by some)
  [[0xff, 0], 8], // multicast
]

/** IPv6 prefixes that carry an IPv4 address in their low 32 bits. */
const V6_WITH_EMBEDDED_V4: readonly { cidr: Cidr; offset: number }[] = [
  { cidr: [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff], 96], offset: 12 }, // ::ffff:0:0/96 mapped
  { cidr: [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 96], offset: 12 }, // ::/96 compatible
  { cidr: [[0, 0x64, 0xff, 0x9b], 32], offset: 12 }, // 64:ff9b::/96 NAT64
  { cidr: [[0x20, 0x02], 16], offset: 2 }, // 2002::/16 6to4
]

function inCidr(bytes: readonly number[], [prefix, length]: Cidr): boolean {
  let remaining = length
  for (let i = 0; i < prefix.length && remaining > 0; i++) {
    const bits = Math.min(8, remaining)
    const mask = (0xff << (8 - bits)) & 0xff
    if ((bytes[i] & mask) !== (prefix[i] & mask)) return false
    remaining -= bits
  }
  return true
}

/** Strict dotted quad only. Every other numeric form is normalized by `URL`. */
function parseIPv4(input: string): number[] | null {
  const parts = input.split('.')
  if (parts.length !== 4) return null
  const bytes: number[] = []
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const value = Number(part)
    if (value > 255) return null
    bytes.push(value)
  }
  return bytes
}

function parseIPv6(input: string): number[] | null {
  let text = input
  if (text.startsWith('[') && text.endsWith(']')) text = text.slice(1, -1)
  const zone = text.indexOf('%')
  if (zone !== -1) text = text.slice(0, zone)
  if (!text.includes(':')) return null

  const halves = text.split('::')
  if (halves.length > 2) return null

  const groups = (part: string): number[][] | null => {
    if (part === '') return []
    const out: number[][] = []
    const pieces = part.split(':')
    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i]
      if (piece.includes('.')) {
        // A trailing dotted quad is only legal as the last two groups.
        if (i !== pieces.length - 1) return null
        const v4 = parseIPv4(piece)
        if (!v4) return null
        out.push([v4[0], v4[1]], [v4[2], v4[3]])
        continue
      }
      if (!/^[0-9a-f]{1,4}$/i.test(piece)) return null
      const value = Number.parseInt(piece, 16)
      out.push([(value >> 8) & 0xff, value & 0xff])
    }
    return out
  }

  const head = groups(halves[0])
  const tail = halves.length === 2 ? groups(halves[1]) : []
  if (!head || !tail) return null

  const bytes: number[] = []
  if (halves.length === 2) {
    const fill = 8 - head.length - tail.length
    if (fill < 0) return null
    for (const group of head) bytes.push(...group)
    for (let i = 0; i < fill; i++) bytes.push(0, 0)
    for (const group of tail) bytes.push(...group)
  } else {
    if (head.length !== 8) return null
    for (const group of head) bytes.push(...group)
  }

  return bytes.length === 16 ? bytes : null
}

type ParsedIp = { version: 4 | 6; bytes: number[] }

/** `null` means "not an IP literal", not "safe". */
function parseIp(input: string): ParsedIp | null {
  const v4 = parseIPv4(input)
  if (v4) return { version: 4, bytes: v4 }
  const v6 = parseIPv6(input)
  if (v6) return { version: 6, bytes: v6 }
  return null
}

function formatIp(ip: ParsedIp): string {
  if (ip.version === 4) return ip.bytes.join('.')
  const groups: string[] = []
  for (let i = 0; i < 16; i += 2) {
    groups.push(((ip.bytes[i] << 8) | ip.bytes[i + 1]).toString(16))
  }
  return groups.join(':')
}

/**
 * True when the address is reachable, routable, public space.
 *
 * IPv6 is checked against its own block list first, then unwrapped: a mapped,
 * NAT64 or 6to4 address carries an IPv4 address inside it, and
 * `::ffff:127.0.0.1` reaches loopback exactly as `127.0.0.1` does.
 */
function isPublicAddress(ip: ParsedIp): boolean {
  if (ip.version === 4) return !BLOCKED_V4.some((cidr) => inCidr(ip.bytes, cidr))

  if (BLOCKED_V6.some((cidr) => inCidr(ip.bytes, cidr))) return false

  for (const { cidr, offset } of V6_WITH_EMBEDDED_V4) {
    if (!inCidr(ip.bytes, cidr)) continue
    const embedded = ip.bytes.slice(offset, offset + 4)
    if (!isPublicAddress({ version: 4, bytes: embedded })) return false
  }

  return true
}

// ---------------------------------------------------------------------------
// assertSafeUrl
// ---------------------------------------------------------------------------

/**
 * Throw `UnsafeUrlError` unless `url` is an https URL whose host is public.
 *
 * A literal IP in the URL is decided without DNS — the `URL` parser has already
 * normalized `2130706433`, `0x7f.0.0.1` and `017700000001` to `127.0.0.1` by
 * the time we see the hostname, so one strict dotted-quad check covers every
 * obfuscated spelling. A name is resolved through the injected resolver, and
 * **every** answer must be public: one private A record among several is enough
 * to refuse, since we do not choose which one `fetch` will connect to.
 *
 * See the module header for the DNS-rebinding gap this cannot close.
 */
export async function assertSafeUrl(
  url: string,
  resolveDns: DnsResolver = defaultResolver,
): Promise<void> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new UnsafeUrlError(`not a URL: ${url}`)
  }

  if (parsed.protocol !== 'https:') {
    throw new UnsafeUrlError(`scheme ${parsed.protocol} is blocked, https only: ${url}`)
  }

  // Credentials in a URL are never legitimate here and are a classic way to
  // make the real host hard to read (`https://trusted.com@10.0.0.1/`).
  if (parsed.username || parsed.password) {
    throw new UnsafeUrlError(`URL carries credentials: ${parsed.host}`)
  }

  const hostname = parsed.hostname
  if (!hostname) throw new UnsafeUrlError(`URL has no host: ${url}`)

  const literal = parseIp(hostname)
  if (literal) {
    if (!isPublicAddress(literal)) {
      throw new UnsafeUrlError(`blocked address literal ${formatIp(literal)}: private, loopback or reserved`)
    }
    return
  }

  // Anything left that is nothing but digits and dots is a numeric host the URL
  // parser refused to normalize. Refuse it rather than hand it to a resolver.
  if (/^[\d.]+$/.test(hostname) || hostname.startsWith('[')) {
    throw new UnsafeUrlError(`unparseable numeric host: ${hostname}`)
  }

  let answers: ResolvedAddress[]
  try {
    answers = await resolveDns(hostname)
  } catch (error) {
    throw new UnsafeUrlError(
      `cannot resolve ${hostname}: ${error instanceof Error ? error.message : 'lookup failed'}`,
    )
  }

  if (answers.length === 0) throw new UnsafeUrlError(`${hostname} resolves to nothing`)

  for (const answer of answers) {
    const ip = parseIp(answer.address)
    // An answer we cannot classify is refused, not waved through.
    if (!ip) throw new UnsafeUrlError(`${hostname} resolved to an unrecognizable address`)
    if (!isPublicAddress(ip)) {
      throw new UnsafeUrlError(
        `${hostname} resolves to ${formatIp(ip)}: private, loopback or reserved`,
      )
    }
  }
}

// ---------------------------------------------------------------------------
// fetchBounded
// ---------------------------------------------------------------------------

export type FetchBoundedOptions = {
  /** Hard ceiling on the response body, enforced over the stream. */
  maxBytes: number
  /** Allowed content types. `type/*` matches a whole family. */
  accept: readonly string[]
  resolveDns?: DnsResolver
  fetchImpl?: FetchImpl
  /** Redirects followed, not counting the first request. Default 3. */
  maxRedirects?: number
  timeoutMs?: number
}

const DEFAULT_MAX_REDIRECTS = 3
const DEFAULT_TIMEOUT_MS = 20_000

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

/**
 * Refused whatever `accept` says.
 *
 * SVG is a document, not a picture: it carries script, external references and
 * entity declarations, and it is served as `image/svg+xml`, so a plain
 * `image/*` allowlist lets it straight through. Task 8 re-encodes downloads
 * through `sharp`, which would also neutralize it — but the fetch layer must
 * not depend on a later stage to be safe.
 */
const DENIED_CONTENT_TYPES = new Set(['image/svg+xml', 'image/svg', 'text/xml-svg'])

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function contentTypeAllowed(value: string, accept: readonly string[]): boolean {
  const type = value.split(';')[0].trim().toLowerCase()
  if (!type) return false
  if (DENIED_CONTENT_TYPES.has(type)) return false
  return accept.some((pattern) => {
    const wanted = pattern.trim().toLowerCase()
    if (wanted === '*/*') return true
    if (wanted.endsWith('/*')) return type.startsWith(`${wanted.slice(0, -1)}`)
    return type === wanted
  })
}

/**
 * Fetch `url` and return at most `maxBytes` of it, or throw.
 *
 * Redirects are followed by hand (`redirect: 'manual'`) because the platform's
 * own following is invisible: it would validate the first URL and then walk
 * wherever the chain led. Each hop goes back through `assertSafeUrl`, so a
 * public URL that redirects into private space is refused at the hop, not after
 * the body arrives.
 *
 * The size cap is applied twice, and the second time is the one that matters. A
 * `content-length` over the cap is refused before the body is read — a cheap
 * early exit — but the header is attacker-controlled and frequently absent, so
 * the stream is also counted chunk by chunk and cancelled the moment it passes
 * the cap. **Never replace the loop with `response.arrayBuffer()`**: that reads
 * the whole body into memory first and the cap becomes decorative.
 */
export async function fetchBounded(url: string, options: FetchBoundedOptions): Promise<Buffer> {
  const {
    maxBytes,
    accept,
    resolveDns = defaultResolver,
    fetchImpl = (target, init) => fetch(target, init),
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options

  let current = url

  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertSafeUrl(current, resolveDns)

    const response = await fetchImpl(current, {
      redirect: 'manual',
      headers: { 'user-agent': USER_AGENT, accept: accept.join(', ') },
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get('location')
      void response.body?.cancel().catch(() => {})
      if (!location) {
        throw new FetchLimitError(`redirect with no location header from ${current}`)
      }
      try {
        current = new URL(location, current).toString()
      } catch {
        throw new UnsafeUrlError(`unparseable redirect location from ${current}`)
      }
      continue
    }

    if (!response.ok) {
      void response.body?.cancel().catch(() => {})
      throw new FetchLimitError(`${response.status} ${response.statusText} for ${current}`)
    }

    const contentType = response.headers.get('content-type')
    if (!contentType || !contentTypeAllowed(contentType, accept)) {
      void response.body?.cancel().catch(() => {})
      throw new FetchLimitError(
        `content-type ${contentType ?? '(absent)'} not accepted for ${current}`,
      )
    }

    const declared = Number(response.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > maxBytes) {
      void response.body?.cancel().catch(() => {})
      throw new FetchLimitError(`content-length ${declared} exceeds the ${maxBytes} byte cap`)
    }

    return await readBounded(response, maxBytes, current)
  }

  throw new FetchLimitError(`more than ${maxRedirects} redirects starting at ${url}`)
}

async function readBounded(response: Response, maxBytes: number, url: string): Promise<Buffer> {
  const reader = response.body?.getReader()
  if (!reader) return Buffer.alloc(0)

  const chunks: Uint8Array[] = []
  let total = 0

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > maxBytes) {
        throw new FetchLimitError(`body exceeds the ${maxBytes} byte cap for ${url}`)
      }
      chunks.push(value)
    }
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  }

  return Buffer.concat(chunks, total)
}
