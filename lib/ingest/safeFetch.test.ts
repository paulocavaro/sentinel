import { describe, expect, it, vi } from 'vitest'
import { assertSafeUrl, fetchBounded, FetchLimitError, UnsafeUrlError } from './safeFetch'
import type { DnsResolver, ResolvedAddress } from './safeFetch'

/** A resolver that answers every hostname with the same fixed address list. */
const resolvesTo = (...addresses: string[]): DnsResolver => {
  const answer: ResolvedAddress[] = addresses.map((address) => ({
    address,
    family: address.includes(':') ? 6 : 4,
  }))
  return vi.fn(async () => answer)
}

/** An ordinary public address, used whenever the address is not the point. */
const publicDns = () => resolvesTo('93.184.216.34')

const encode = (text: string) => new TextEncoder().encode(text)

const streamOf = (chunks: Uint8Array[]): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })

/** A response whose body is a stream, so no `content-length` is inferred. */
const streamed = (
  chunks: Uint8Array[],
  headers: Record<string, string>,
  status = 200,
): Response => new Response(streamOf(chunks), { status, headers })

const redirectTo = (location: string, status = 302): Response =>
  new Response(null, { status, headers: { location } })

// ---------------------------------------------------------------------------
// assertSafeUrl
// ---------------------------------------------------------------------------

describe('assertSafeUrl', () => {
  it('accepts an ordinary public address', async () => {
    await expect(assertSafeUrl('https://example.com/a.png', publicDns())).resolves.toBeUndefined()
  })

  it('rejects a non-https scheme', async () => {
    for (const url of [
      'http://example.com/a.png',
      'javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'file:///etc/passwd',
      'ftp://example.com/a',
      'gopher://example.com/a',
    ]) {
      await expect(assertSafeUrl(url, publicDns())).rejects.toThrow(UnsafeUrlError)
    }
  })

  it('rejects something that is not a URL at all', async () => {
    await expect(assertSafeUrl('not a url', publicDns())).rejects.toThrow(UnsafeUrlError)
  })

  it('rejects a hostname that resolves to IPv4 loopback', async () => {
    await expect(assertSafeUrl('https://evil.example/a', resolvesTo('127.0.0.1'))).rejects.toThrow(
      /loopback|private|blocked/i,
    )
  })

  it('rejects a hostname that resolves to IPv6 loopback', async () => {
    await expect(assertSafeUrl('https://evil.example/a', resolvesTo('::1'))).rejects.toThrow(
      UnsafeUrlError,
    )
  })

  it('rejects a hostname that resolves to the cloud metadata endpoint', async () => {
    await expect(
      assertSafeUrl('https://evil.example/latest/meta-data/', resolvesTo('169.254.169.254')),
    ).rejects.toThrow(UnsafeUrlError)
  })

  it('rejects every RFC1918 range', async () => {
    for (const address of ['10.0.0.1', '10.255.255.254', '172.16.0.1', '172.31.255.254', '192.168.1.1']) {
      await expect(assertSafeUrl('https://evil.example/a', resolvesTo(address))).rejects.toThrow(
        UnsafeUrlError,
      )
    }
  })

  it('does not mistake the addresses either side of 172.16.0.0/12 for private ones', async () => {
    await expect(assertSafeUrl('https://ok.example/a', resolvesTo('172.15.0.1'))).resolves.toBeUndefined()
    await expect(assertSafeUrl('https://ok.example/a', resolvesTo('172.32.0.1'))).resolves.toBeUndefined()
  })

  it('rejects IPv6 unique-local (fc00::/7) and link-local (fe80::/10)', async () => {
    for (const address of ['fc00::1', 'fd12:3456:789a::1', 'fe80::1']) {
      await expect(assertSafeUrl('https://evil.example/a', resolvesTo(address))).rejects.toThrow(
        UnsafeUrlError,
      )
    }
  })

  it('rejects an IPv4-mapped IPv6 answer that hides a loopback address', async () => {
    await expect(
      assertSafeUrl('https://evil.example/a', resolvesTo('::ffff:127.0.0.1')),
    ).rejects.toThrow(UnsafeUrlError)
  })

  it('rejects when any one of several answers is private', async () => {
    await expect(
      assertSafeUrl('https://evil.example/a', resolvesTo('93.184.216.34', '10.0.0.5')),
    ).rejects.toThrow(UnsafeUrlError)
  })

  it('rejects when the resolver returns nothing', async () => {
    await expect(assertSafeUrl('https://evil.example/a', resolvesTo())).rejects.toThrow(UnsafeUrlError)
  })

  it('rejects when the resolver itself fails, rather than falling through', async () => {
    const failing: DnsResolver = async () => {
      throw new Error('ENOTFOUND')
    }
    await expect(assertSafeUrl('https://evil.example/a', failing)).rejects.toThrow(UnsafeUrlError)
  })

  it('rejects a literal private IP in the URL without consulting DNS', async () => {
    for (const url of [
      'https://127.0.0.1/a',
      'https://10.0.0.1/a',
      'https://192.168.0.1/a',
      'https://169.254.169.254/latest/meta-data/',
      'https://[::1]/a',
      'https://[fd00::1]/a',
    ]) {
      const resolver = vi.fn<DnsResolver>()
      await expect(assertSafeUrl(url, resolver)).rejects.toThrow(UnsafeUrlError)
      expect(resolver).not.toHaveBeenCalled()
    }
  })

  it('accepts a literal public IP without consulting DNS', async () => {
    const resolver = vi.fn<DnsResolver>()
    await expect(assertSafeUrl('https://93.184.216.34/a', resolver)).resolves.toBeUndefined()
    expect(resolver).not.toHaveBeenCalled()
  })

  it('rejects a loopback address dressed up in a non-dotted-quad form', async () => {
    // WHATWG URL normalizes these to 127.0.0.1 before we ever see them; the
    // test exists so a future hand-rolled host parser cannot lose the property.
    const resolver = vi.fn<DnsResolver>()
    for (const url of ['https://2130706433/a', 'https://0x7f.0.0.1/a', 'https://017700000001/a']) {
      await expect(assertSafeUrl(url, resolver)).rejects.toThrow(UnsafeUrlError)
    }
    expect(resolver).not.toHaveBeenCalled()
  })

  it('rejects credentials embedded in the URL', async () => {
    await expect(assertSafeUrl('https://user:pass@example.com/a', publicDns())).rejects.toThrow(
      UnsafeUrlError,
    )
  })

  it('rejects carrier-grade NAT, multicast and reserved space', async () => {
    for (const address of ['100.64.0.1', '224.0.0.1', '240.0.0.1', '0.0.0.0']) {
      await expect(assertSafeUrl('https://evil.example/a', resolvesTo(address))).rejects.toThrow(
        UnsafeUrlError,
      )
    }
  })
})

// ---------------------------------------------------------------------------
// fetchBounded
// ---------------------------------------------------------------------------

describe('fetchBounded', () => {
  const html = { maxBytes: 1000, accept: ['text/html'] as const }

  it('returns the body on the happy path', async () => {
    const fetchImpl = vi.fn(async () =>
      streamed([encode('<html>hi</html>')], { 'content-type': 'text/html; charset=utf-8' }),
    )
    const out = await fetchBounded('https://example.com/a', {
      ...html,
      resolveDns: publicDns(),
      fetchImpl,
    })
    expect(out.toString('utf8')).toBe('<html>hi</html>')
  })

  it('validates the first URL through assertSafeUrl before fetching', async () => {
    const fetchImpl = vi.fn(async () => streamed([], { 'content-type': 'text/html' }))
    await expect(
      fetchBounded('https://evil.example/a', {
        ...html,
        resolveDns: resolvesTo('169.254.169.254'),
        fetchImpl,
      }),
    ).rejects.toThrow(UnsafeUrlError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects when the content-length header exceeds the cap, without reading the body', async () => {
    const fetchImpl = vi.fn(async () =>
      streamed([encode('x')], { 'content-type': 'text/html', 'content-length': '5000' }),
    )
    await expect(
      fetchBounded('https://example.com/a', { ...html, resolveDns: publicDns(), fetchImpl }),
    ).rejects.toThrow(FetchLimitError)
  })

  it('rejects when the streamed body exceeds the cap and NO content-length was sent', async () => {
    const chunks = Array.from({ length: 10 }, () => new Uint8Array(200))
    const make = () => streamed(chunks, { 'content-type': 'text/html' })

    // The premise of the test: nothing declares the size up front, so only a
    // running counter over the stream can stop this.
    expect(make().headers.get('content-length')).toBeNull()

    await expect(
      fetchBounded('https://example.com/a', {
        ...html,
        resolveDns: publicDns(),
        fetchImpl: async () => make(),
      }),
    ).rejects.toThrow(FetchLimitError)
  })

  it('rejects when the streamed body exceeds the cap despite a small content-length', async () => {
    const chunks = Array.from({ length: 10 }, () => new Uint8Array(200))
    const fetchImpl = async () =>
      streamed(chunks, { 'content-type': 'text/html', 'content-length': '10' })
    await expect(
      fetchBounded('https://example.com/a', { ...html, resolveDns: publicDns(), fetchImpl }),
    ).rejects.toThrow(FetchLimitError)
  })

  it('accepts a body exactly at the cap', async () => {
    const fetchImpl = async () =>
      streamed([new Uint8Array(1000)], { 'content-type': 'text/html' })
    const out = await fetchBounded('https://example.com/a', {
      ...html,
      resolveDns: publicDns(),
      fetchImpl,
    })
    expect(out.byteLength).toBe(1000)
  })

  it('rejects a content-type outside accept', async () => {
    const fetchImpl = async () =>
      streamed([encode('{}')], { 'content-type': 'application/json' })
    await expect(
      fetchBounded('https://example.com/a', { ...html, resolveDns: publicDns(), fetchImpl }),
    ).rejects.toThrow(/content-type/i)
  })

  it('rejects a missing content-type rather than guessing', async () => {
    const fetchImpl = async () => streamed([encode('hi')], {})
    await expect(
      fetchBounded('https://example.com/a', { ...html, resolveDns: publicDns(), fetchImpl }),
    ).rejects.toThrow(/content-type/i)
  })

  it('honours a type/* wildcard in accept', async () => {
    const fetchImpl = async () => streamed([new Uint8Array(4)], { 'content-type': 'image/webp' })
    const out = await fetchBounded('https://example.com/a.webp', {
      maxBytes: 1000,
      accept: ['image/*'],
      resolveDns: publicDns(),
      fetchImpl,
    })
    expect(out.byteLength).toBe(4)
  })

  it('rejects image/svg+xml even when image/* is accepted', async () => {
    const fetchImpl = async () =>
      streamed([encode('<svg onload="fetch(1)"/>')], { 'content-type': 'image/svg+xml' })
    await expect(
      fetchBounded('https://example.com/a.svg', {
        maxBytes: 1000,
        accept: ['image/*'],
        resolveDns: publicDns(),
        fetchImpl,
      }),
    ).rejects.toThrow(/svg/i)
  })

  it('rejects a non-2xx response', async () => {
    const fetchImpl = async () => streamed([], { 'content-type': 'text/html' }, 500)
    await expect(
      fetchBounded('https://example.com/a', { ...html, resolveDns: publicDns(), fetchImpl }),
    ).rejects.toThrow(/500/)
  })

  it('follows redirects and re-validates every hop through assertSafeUrl', async () => {
    const chain: Record<string, Response> = {}
    const hops = [
      'https://one.example/a',
      'https://two.example/a',
      'https://three.example/a',
      'https://four.example/a',
    ]
    chain[hops[0]] = redirectTo(hops[1])
    chain[hops[1]] = redirectTo(hops[2], 301)
    chain[hops[2]] = redirectTo(hops[3], 307)
    chain[hops[3]] = streamed([encode('done')], { 'content-type': 'text/html' })

    const resolveDns = publicDns()
    const fetchImpl = vi.fn(async (url: string) => chain[url])

    const out = await fetchBounded(hops[0], { ...html, resolveDns, fetchImpl })
    expect(out.toString('utf8')).toBe('done')
    expect(fetchImpl).toHaveBeenCalledTimes(4)
    expect(resolveDns).toHaveBeenCalledTimes(4)
    expect((resolveDns as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toEqual([
      'one.example',
      'two.example',
      'three.example',
      'four.example',
    ])
  })

  it('follows at most three redirects', async () => {
    let hop = 0
    const fetchImpl = vi.fn(async () => redirectTo(`https://hop${++hop}.example/a`))
    await expect(
      fetchBounded('https://start.example/a', { ...html, resolveDns: publicDns(), fetchImpl }),
    ).rejects.toThrow(/redirect/i)
    // The original request plus three followed hops, and no fifth request.
    expect(fetchImpl).toHaveBeenCalledTimes(4)
  })

  it('rejects a redirect to a private address', async () => {
    const resolveDns: DnsResolver = async (hostname) =>
      hostname === 'start.example'
        ? [{ address: '93.184.216.34', family: 4 }]
        : [{ address: '169.254.169.254', family: 4 }]
    const fetchImpl = vi.fn(async () => redirectTo('https://internal.example/latest/meta-data/'))

    await expect(
      fetchBounded('https://start.example/a', { ...html, resolveDns, fetchImpl }),
    ).rejects.toThrow(UnsafeUrlError)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('rejects a redirect straight to a literal private address', async () => {
    const fetchImpl = vi.fn(async () => redirectTo('http://169.254.169.254/latest/meta-data/'))
    await expect(
      fetchBounded('https://start.example/a', { ...html, resolveDns: publicDns(), fetchImpl }),
    ).rejects.toThrow(UnsafeUrlError)
  })

  it('resolves a relative Location against the URL that produced it', async () => {
    const seen: string[] = []
    const fetchImpl = vi.fn(async (url: string) => {
      seen.push(url)
      return seen.length === 1
        ? redirectTo('/elsewhere/b.html')
        : streamed([encode('ok')], { 'content-type': 'text/html' })
    })
    const out = await fetchBounded('https://example.com/deep/a.html', {
      ...html,
      resolveDns: publicDns(),
      fetchImpl,
    })
    expect(out.toString('utf8')).toBe('ok')
    expect(seen[1]).toBe('https://example.com/elsewhere/b.html')
  })

  it('rejects a redirect with no Location header', async () => {
    const fetchImpl = async () => new Response(null, { status: 302 })
    await expect(
      fetchBounded('https://example.com/a', { ...html, resolveDns: publicDns(), fetchImpl }),
    ).rejects.toThrow(/location/i)
  })

  it('never lets the platform follow redirects on its own', async () => {
    let init: RequestInit | undefined
    const fetchImpl = async (_url: string, options: RequestInit) => {
      init = options
      return streamed([encode('hi')], { 'content-type': 'text/html' })
    }
    await fetchBounded('https://example.com/a', { ...html, resolveDns: publicDns(), fetchImpl })
    expect(init?.redirect).toBe('manual')
  })
})
