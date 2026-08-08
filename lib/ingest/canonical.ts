import { createHash } from 'node:crypto'

const TRACKING_PREFIXES = ['utm_', 'ref_']
const TRACKING_KEYS = new Set(['ref', 'fbclid', 'gclid', 'mc_cid', 'mc_eid'])

export function canonicalUrl(url: string): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return url
  }

  parsed.hash = ''
  if (parsed.protocol === 'http:') parsed.protocol = 'https:'
  parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, '')

  // Normalize the parsed pathname, never the serialized string: a trailing
  // slash followed by a query string is invisible to a string-level check.
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
    parsed.pathname = parsed.pathname.slice(0, -1)
  }

  for (const key of [...parsed.searchParams.keys()]) {
    const lower = key.toLowerCase()
    if (TRACKING_KEYS.has(lower) || TRACKING_PREFIXES.some((p) => lower.startsWith(p))) {
      parsed.searchParams.delete(key)
    }
  }
  parsed.searchParams.sort()

  return parsed.toString()
}

export function itemId(url: string): string {
  return createHash('sha256').update(canonicalUrl(url)).digest('hex').slice(0, 12)
}
