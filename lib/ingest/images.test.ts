import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { downloadImage, extractOgImage, resolveImages } from './images'
import type { RawItem } from './types'

const item = (over: Partial<RawItem> = {}): RawItem => ({
  id: 'aaaaaaaaaaaa',
  title: 'A title',
  summary: 'A summary',
  url: 'https://e.com/article',
  imageUrl: null,
  source: { id: 's', name: 'S', kind: 'press', priority: 1 },
  themes: ['ai'],
  publishedAt: '2026-08-07T10:00:00.000Z',
  ...over,
})

const page = (head: string) => `<!doctype html><html><head>${head}</head><body>x</body></html>`

// ---------------------------------------------------------------------------
// extractOgImage
// ---------------------------------------------------------------------------

describe('extractOgImage', () => {
  it('reads og:image with property before content', () => {
    const html = page('<meta property="og:image" content="https://e.com/a.jpg">')
    expect(extractOgImage(html, 'https://e.com/article')).toBe('https://e.com/a.jpg')
  })

  it('reads og:image with content before property', () => {
    const html = page('<meta content="https://e.com/b.jpg" property="og:image" />')
    expect(extractOgImage(html, 'https://e.com/article')).toBe('https://e.com/b.jpg')
  })

  it('falls back to twitter:image when there is no og:image', () => {
    const html = page('<meta name="twitter:image" content="https://e.com/t.jpg">')
    expect(extractOgImage(html, 'https://e.com/article')).toBe('https://e.com/t.jpg')
  })

  it('prefers og:image over twitter:image', () => {
    const html = page(
      '<meta name="twitter:image" content="https://e.com/t.jpg">' +
        '<meta property="og:image" content="https://e.com/o.jpg">',
    )
    expect(extractOgImage(html, 'https://e.com/article')).toBe('https://e.com/o.jpg')
  })

  it('resolves a relative og:image against the base url', () => {
    const html = page('<meta property="og:image" content="/media/a.jpg">')
    expect(extractOgImage(html, 'https://e.com/section/article')).toBe('https://e.com/media/a.jpg')
  })

  it('returns null when the page carries no image metadata', () => {
    expect(extractOgImage(page('<title>Nothing</title>'), 'https://e.com/article')).toBeNull()
  })

  it('returns null for a body that is not HTML at all', () => {
    expect(extractOgImage('', 'https://e.com/article')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// resolveImages
// ---------------------------------------------------------------------------

describe('resolveImages', () => {
  it('leaves an item that already has an image untouched and never fetches for it', async () => {
    const fetchHtml = vi.fn(async () => page('<meta property="og:image" content="https://e.com/o.jpg">'))
    const items = [item({ imageUrl: 'https://e.com/feed.jpg' })]

    const out = await resolveImages(items, fetchHtml)

    expect(out[0].imageUrl).toBe('https://e.com/feed.jpg')
    expect(fetchHtml).not.toHaveBeenCalled()
  })

  it('fetches the article page only for items with no image, and sets what it found', async () => {
    const fetchHtml = vi.fn(async () => page('<meta property="og:image" content="https://e.com/o.jpg">'))
    const items = [
      item({ id: 'withimage', url: 'https://e.com/1', imageUrl: 'https://e.com/feed.jpg' }),
      item({ id: 'noimage', url: 'https://e.com/2' }),
    ]

    const out = await resolveImages(items, fetchHtml)

    expect(fetchHtml).toHaveBeenCalledTimes(1)
    expect(fetchHtml).toHaveBeenCalledWith('https://e.com/2')
    expect(out[0].imageUrl).toBe('https://e.com/feed.jpg')
    expect(out[1].imageUrl).toBe('https://e.com/o.jpg')
  })

  it('leaves imageUrl null when the fetch rejects, and keeps the other items', async () => {
    // The common case is the SSRF guard refusing the article URL.
    const fetchHtml = vi.fn(async (url: string) => {
      if (url.includes('/bad')) throw new Error('blocked address literal 127.0.0.1')
      return page('<meta property="og:image" content="https://e.com/o.jpg">')
    })
    const items = [item({ id: 'bad', url: 'https://e.com/bad' }), item({ id: 'good', url: 'https://e.com/good' })]

    const out = await resolveImages(items, fetchHtml)

    expect(out[0].imageUrl).toBeNull()
    expect(out[1].imageUrl).toBe('https://e.com/o.jpg')
  })

  it('leaves imageUrl null when the page has no image metadata', async () => {
    const out = await resolveImages([item()], async () => page('<title>Nothing</title>'))
    expect(out[0].imageUrl).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// downloadImage
// ---------------------------------------------------------------------------

describe('downloadImage', () => {
  let dir: string
  let png: Buffer

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sentinel-images-'))
    png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 40, b: 40 } },
    })
      .png()
      .toBuffer()
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('returns null when fetchBytes rejects', async () => {
    const dest = join(dir, 'rejected.webp')
    const fetchBytes = vi.fn(async () => {
      throw new Error('blocked address literal 169.254.169.254')
    })

    await expect(downloadImage('https://e.com/a.png', dest, fetchBytes)).resolves.toBeNull()
    await expect(readFile(dest)).rejects.toThrow()
  })

  it('returns null when the bytes are not a decodable image', async () => {
    const dest = join(dir, 'garbage.webp')
    await expect(
      downloadImage('https://e.com/a.png', dest, async () => Buffer.from('not an image')),
    ).resolves.toBeNull()
  })

  it('writes a webp and returns its public path on success', async () => {
    const dest = join(dir, 'aaaaaaaaaaaa.webp')

    const result = await downloadImage('https://e.com/a.png', dest, async () => png)

    expect(result).toBe('/img/aaaaaaaaaaaa.webp')
    const written = await readFile(dest)
    // A webp file is a RIFF container tagged WEBP: proof of the re-encode.
    expect(written.subarray(0, 4).toString('ascii')).toBe('RIFF')
    expect(written.subarray(8, 12).toString('ascii')).toBe('WEBP')
    const meta = await sharp(written).metadata()
    expect(meta.format).toBe('webp')
    // 8px wide in, 8px wide out — smaller images are never enlarged.
    expect(meta.width).toBe(8)
  })
})
