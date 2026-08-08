import { mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import sharp from 'sharp'
import { CONCURRENCY } from './config'
import { mapWithConcurrency } from './concurrency'
import { fetchBounded } from './safeFetch'
import type { RawItem } from './types'

/**
 * Image resolution and download.
 *
 * Two network paths, both walking URLs that came out of an untrusted feed: the
 * article page (read for its `og:image` when the feed carried none) and the
 * image itself. Both go through `fetchBounded`, so both get the SSRF guard, the
 * byte cap, the content-type allowlist and the re-validated redirect chain.
 * Neither function here calls `fetch` — the reader is injected at both
 * boundaries, so no test opens a socket.
 *
 * ---------------------------------------------------------------------------
 * RE-ENCODING THROUGH `sharp` IS A SECURITY PROPERTY, NOT AN OPTIMIZATION.
 * ---------------------------------------------------------------------------
 * `downloadImage` never copies the fetched bytes to disk. It decodes them to
 * pixels and writes a *new* webp built from those pixels, which discards
 * everything that was not picture: appended archives and polyglot payloads,
 * EXIF/XMP/ICC blobs, trailing bytes after the image data, and any format
 * confusion between what the server declared and what the file actually is.
 * That last one is the reason this matters most — `safeFetch` believes the
 * server's `content-type` header, because nothing else is available at header
 * time. A host can declare `image/png` and send anything at all. The decode is
 * the only step in the pipeline that reads the bytes and decides what they
 * really are, and the file that reaches `public/` is one this process wrote.
 *
 * So: **do not** turn this into a passthrough copy, and do not "skip the
 * re-encode when the source is already webp". A cheaper write is not the same
 * write. `limitInputPixels` is part of the same control — it stops a small
 * file that decodes into a gigapixel canvas from exhausting the runner.
 */

/** Reads an article page. Rejecting is an ordinary outcome. */
export type HtmlFetcher = (url: string) => Promise<string>

/** Reads image bytes. Rejecting is an ordinary outcome. */
export type BytesFetcher = (url: string) => Promise<Buffer>

/** Article pages: enough for the `<head>`, nowhere near enough to hurt. */
const MAX_HTML_BYTES = 2 * 1024 * 1024

/** Images: past this it is not an article illustration. */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

/** Published width. Cards never render wider than this. */
const OUTPUT_WIDTH = 800

const WEBP_QUALITY = 80

/** ~25 MP decoded, whatever the compressed size claimed. */
const MAX_INPUT_PIXELS = 25e6

/** Where the written files are served from. `public/img/x.webp` → `/img/x.webp`. */
const PUBLIC_PREFIX = '/img'

// ---------------------------------------------------------------------------
// extractOgImage
// ---------------------------------------------------------------------------

const META_TAG = /<meta\b[^>]*>/gi
const META_ATTR = /([a-z][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+))/gi

/**
 * A deliberately small entity decode.
 *
 * Only what actually shows up inside a `content` attribute holding a URL —
 * `&amp;` between query parameters is near-universal. This is not a general
 * HTML decoder and must not grow into one; the value is fed to `new URL`, which
 * is the real validation.
 */
const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&#38;': '&',
  '&#x26;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
}

function decodeAttribute(value: string): string {
  return value.replace(/&(?:amp|quot|apos|#38|#x26|#39);/gi, (match) => ENTITIES[match.toLowerCase()] ?? match)
}

/**
 * The absolute URL of the page's social image, or null.
 *
 * Regex rather than a DOM parse on purpose: this runs over an arbitrary,
 * possibly malformed, up-to-2 MB page from an untrusted host, and all we want
 * is one attribute out of the `<head>`. A full parse would cost more and buy
 * nothing — the value is validated by `new URL` and then, before a byte is
 * fetched, by `assertSafeUrl`.
 *
 * `og:image` wins; `twitter:image` is the fallback. Attribute order does not
 * matter — publishers emit both `property`/`content` and `content`/`property`.
 * A relative value is resolved against `baseUrl`, which is why the article URL
 * has to be passed in rather than guessed.
 */
export function extractOgImage(html: string, baseUrl: string): string | null {
  if (!html) return null

  let og: string | null = null
  let twitter: string | null = null

  for (const tag of html.match(META_TAG) ?? []) {
    let key = ''
    let content = ''

    META_ATTR.lastIndex = 0
    for (let attr = META_ATTR.exec(tag); attr; attr = META_ATTR.exec(tag)) {
      const name = attr[1].toLowerCase()
      const value = attr[2] ?? attr[3] ?? attr[4] ?? ''
      // `property` is the Open Graph spelling, `name` the Twitter one; some
      // publishers use either for both.
      if (name === 'property' || name === 'name') key = value.trim().toLowerCase()
      else if (name === 'content') content = value
    }

    if (!content) continue
    if (key === 'og:image' && !og) og = content
    else if (key === 'twitter:image' && !twitter) twitter = content
  }

  const raw = og ?? twitter
  if (!raw) return null

  try {
    return new URL(decodeAttribute(raw).trim(), baseUrl).toString()
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// resolveImages
// ---------------------------------------------------------------------------

/**
 * Fill in `imageUrl` for the items that have none, by reading their page.
 *
 * Items that already carry an image from the feed are returned untouched and
 * are never fetched — the feed's own `media:content` is both cheaper and more
 * reliable than scraping. Only the gaps cost a request, and the requests run
 * through the same worker pool the collection stage uses.
 *
 * A rejection is not an error: the SSRF guard refusing an article URL is the
 * expected outcome for a fair share of Hacker News links. The item keeps a null
 * `imageUrl` and the edition renders without a picture.
 */
export async function resolveImages(
  items: readonly RawItem[],
  fetchHtml: HtmlFetcher,
): Promise<RawItem[]> {
  const resolved = [...items]

  const gaps = resolved
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !item.imageUrl)

  const found = await mapWithConcurrency(gaps, CONCURRENCY, async ({ item }) =>
    extractOgImage(await fetchHtml(item.url), item.url),
  )

  found.forEach((result, position) => {
    if (result.status !== 'fulfilled' || !result.value) return
    const { index } = gaps[position]
    resolved[index] = { ...resolved[index], imageUrl: result.value }
  })

  return resolved
}

// ---------------------------------------------------------------------------
// downloadImage
// ---------------------------------------------------------------------------

/**
 * Fetch, re-encode and write one image. Returns its public path, or null.
 *
 * Every failure — refused URL, oversized body, wrong content type, undecodable
 * bytes, a disk error — resolves to null. A missing image is a designed state
 * of the edition, not an error condition: `Item.image` is nullable and the run
 * must not abort because a publisher's CDN was slow.
 *
 * `destPath` is the file to write, conventionally `public/img/<id>.webp`. The
 * returned path is what goes into the edition JSON and then into `<img src>`.
 */
export async function downloadImage(
  url: string,
  destPath: string,
  fetchBytes: BytesFetcher,
): Promise<string | null> {
  try {
    const source = await fetchBytes(url)

    // Decode to pixels, re-encode from pixels. See the module header: this is
    // the control, not a size optimization.
    const encoded = await sharp(source, { limitInputPixels: MAX_INPUT_PIXELS })
      .resize({ width: OUTPUT_WIDTH, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer()

    await mkdir(dirname(destPath), { recursive: true })
    await writeFile(destPath, encoded)

    return `${PUBLIC_PREFIX}/${basename(destPath)}`
  } catch {
    return null
  }
}

/**
 * Download every item's image under the concurrency cap.
 *
 * Returns item id → public path, with no entry for the items that had no image
 * or whose download failed, so the caller reads a miss as `undefined` and
 * writes `null`.
 */
export async function downloadImages(
  items: readonly RawItem[],
  destDir: string,
  fetchBytes: BytesFetcher,
): Promise<Map<string, string>> {
  const withImages = items.filter((item) => item.imageUrl)

  const results = await mapWithConcurrency(withImages, CONCURRENCY, (item) =>
    downloadImage(item.imageUrl as string, join(destDir, `${item.id}.webp`), fetchBytes),
  )

  const paths = new Map<string, string>()
  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value) paths.set(withImages[index].id, result.value)
  })

  return paths
}

// ---------------------------------------------------------------------------
// The real network readers. Imported by no test.
// ---------------------------------------------------------------------------

/**
 * Read an article page, bounded at 2 MB and `text/html` only.
 *
 * The body is decoded as UTF-8 unconditionally. A page in another encoding may
 * mangle its prose, which we never read — the only thing extracted is a URL out
 * of a meta attribute, and those are ASCII in practice.
 */
export const httpHtmlFetcher: HtmlFetcher = async (url) => {
  const body = await fetchBounded(url, { maxBytes: MAX_HTML_BYTES, accept: ['text/html'] })
  return body.toString('utf8')
}

/**
 * Read image bytes, bounded at 10 MB and `image/*`.
 *
 * `safeFetch` refuses `image/svg+xml` unconditionally, so the wildcard does not
 * open the door to a scriptable document.
 */
export const httpImageFetcher: BytesFetcher = (url) =>
  fetchBounded(url, { maxBytes: MAX_IMAGE_BYTES, accept: ['image/*'] })
