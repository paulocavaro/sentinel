/**
 * Who published the article, derived from the article's own URL.
 *
 * A feed name is not a publisher. Hacker News is a list of other people's
 * links; "BBC World" and "TechCrunch AI" are sections, not mastheads. The card
 * says "tap to read this at the source", so the byline has to name the site the
 * tap actually lands on — anything else is the product telling a small lie
 * twenty times a day. The feed is still recorded on the item, as provenance,
 * and is still what dedupe priority keys on; it is simply not the byline.
 *
 * Deriving from the URL means the answer cannot drift from the destination: the
 * two are computed from the same string.
 */

/** What a card shows when the URL cannot be parsed at all. */
const FALLBACK = 'Unknown source'

/**
 * Hosts whose pretty name is not what the hostname mechanically produces —
 * capitalization ("TechCrunch", "WIRED"), spacing ("Ars Technica"), an article
 * ("The Guardian"), an expansion ("NPR", "MIT Technology Review") or a name
 * that is simply not in the domain ("Google DeepMind" on `deepmind.google`).
 *
 * Keys are matched most-specific-first, so a section subdomain can carry its
 * own name — `finance.yahoo.com` is Yahoo Finance while the bare host is not.
 * Everything absent from here still gets a reasonable answer from
 * `mechanicalName`; this list exists to make the common cases *right*, not to
 * be exhaustive.
 */
const KNOWN: Record<string, string> = {
  'news.ycombinator.com': 'Hacker News',
  'finance.yahoo.com': 'Yahoo Finance',
  'techcrunch.com': 'TechCrunch',
  'arstechnica.com': 'Ars Technica',
  'theguardian.com': 'The Guardian',
  'bbc.co.uk': 'BBC',
  'bbci.co.uk': 'BBC',
  'bbc.com': 'BBC',
  'npr.org': 'NPR',
  'openai.com': 'OpenAI',
  'anthropic.com': 'Anthropic',
  'deepmind.google': 'Google DeepMind',
  'huggingface.co': 'Hugging Face',
  'technologyreview.com': 'MIT Technology Review',
  'simonwillison.net': 'Simon Willison',
  'reuters.com': 'Reuters',
  'cnn.com': 'CNN',
  'scientificamerican.com': 'Scientific American',
  'nytimes.com': 'The New York Times',
  'wsj.com': 'The Wall Street Journal',
  'washingtonpost.com': 'The Washington Post',
  'ft.com': 'Financial Times',
  'theverge.com': 'The Verge',
  'wired.com': 'WIRED',
  'bloomberg.com': 'Bloomberg',
  'theatlantic.com': 'The Atlantic',
  'apnews.com': 'The Associated Press',
  'aljazeera.com': 'Al Jazeera',
  'arxiv.org': 'arXiv',
  'github.com': 'GitHub',
  'youtube.com': 'YouTube',
  'ai.meta.com': 'Meta AI',
  'blog.google': 'Google',
}

/**
 * Public suffixes with a dot in them.
 *
 * Without this, "the label before the last one" makes every British outlet
 * "Co" and every Australian one "Com". This is a short pragmatic list, not the
 * Mozilla Public Suffix List: pulling in a real PSL means a dependency plus a
 * data file that goes stale, to correct a name on a card. A suffix that is
 * missing here degrades to a slightly wrong name for one outlet, never to a
 * wrong link or an empty string, and the fix is one line.
 */
const MULTI_PART_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'net.uk', 'sch.uk',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  'co.jp', 'or.jp', 'ne.jp', 'ac.jp', 'go.jp',
  'com.br', 'net.br', 'org.br', 'gov.br',
  'co.nz', 'net.nz', 'org.nz',
  'co.in', 'net.in', 'org.in',
  'co.za', 'org.za',
  'co.kr', 'or.kr',
  'com.cn', 'net.cn', 'org.cn', 'gov.cn',
  'com.tw', 'com.hk', 'com.sg', 'com.my', 'com.ph', 'com.vn', 'com.pk',
  'com.tr', 'com.ua', 'com.pl', 'com.es', 'com.mx', 'com.ar', 'com.co',
  'com.pe', 'com.ve', 'com.ec', 'com.uy', 'com.ng', 'com.eg', 'com.sa',
  'co.il', 'co.id', 'co.th', 'co.ke',
])

/** A bare IPv4 or IPv6 host: there is no name in it to pretty-print. */
const IP_LIKE = /^[0-9.]+$|^\[?[0-9a-f:]+\]?$/i

/**
 * The hostname, lowercased, with the root dot and a leading `www.` removed.
 * Empty when the input is not a URL with a host — `mailto:` included.
 */
function hostnameOf(url: string): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return ''
  }

  return parsed.hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, '')
}

/** How many trailing labels are the registrable domain: `bbc.co.uk` is three. */
function registrableLength(labels: readonly string[]): number {
  if (labels.length >= 3 && MULTI_PART_SUFFIXES.has(labels.slice(-2).join('.'))) return 3
  return 2
}

/**
 * The host, then the host with one leading label removed, and so on down to the
 * registrable domain. `finance.yahoo.com` before `yahoo.com`, so the more
 * specific entry in `KNOWN` wins; `feeds.bbci.co.uk` reaches `bbci.co.uk` but
 * never strips into the suffix itself.
 */
function candidateHosts(host: string): string[] {
  const labels = host.split('.').filter(Boolean)
  const shortest = Math.min(registrableLength(labels), labels.length)

  const hosts: string[] = []
  for (let start = 0; start <= labels.length - shortest; start++) {
    hosts.push(labels.slice(start).join('.'))
  }
  return hosts
}

/** `some-blog` → `Some Blog`. Word separators only; nothing else is touched. */
function titleCase(label: string): string {
  return label
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * The name label of the registrable domain, title-cased: `app.dealroom.co` is
 * "Dealroom", `mezha.net` is "Mezha". A host with no name in it — an IP address
 * — is returned as it is, which is honest rather than pretty.
 */
function mechanicalName(host: string): string {
  if (IP_LIKE.test(host)) return host

  const labels = host.split('.').filter(Boolean)
  if (labels.length === 0) return FALLBACK

  const index = Math.max(labels.length - registrableLength(labels), 0)
  return titleCase(labels[index]) || FALLBACK
}

/**
 * The publisher to print on the card for an article at `url`.
 *
 * Never empty: this value is written to the permanent archive and rendered as a
 * byline, and a blank byline is a worse failure than an imperfect name.
 */
export function publisherFromUrl(url: string): string {
  const host = hostnameOf(url)
  if (host.length === 0) return FALLBACK

  for (const candidate of candidateHosts(host)) {
    const known = KNOWN[candidate]
    if (known) return known
  }

  return mechanicalName(host)
}
