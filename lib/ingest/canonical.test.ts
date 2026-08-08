import { describe, expect, it } from 'vitest'
import { canonicalUrl, itemId } from './canonical'

describe('canonicalUrl', () => {
  it('lowercases the host but not the path', () => {
    expect(canonicalUrl('https://Example.COM/A-Path')).toBe('https://example.com/A-Path')
  })

  it('strips tracking parameters and keeps meaningful ones', () => {
    expect(canonicalUrl('https://e.com/a?utm_source=x&id=7&utm_medium=y'))
      .toBe('https://e.com/a?id=7')
  })

  it('drops a trailing slash even when a query string follows', () => {
    expect(canonicalUrl('https://e.com/a/?id=7')).toBe(canonicalUrl('https://e.com/a?id=7'))
  })

  it('keeps the root path', () => {
    expect(canonicalUrl('https://e.com/')).toBe('https://e.com/')
  })

  it('strips a leading www.', () => {
    expect(canonicalUrl('https://www.e.com/a')).toBe(canonicalUrl('https://e.com/a'))
  })

  it('normalizes the scheme to https', () => {
    expect(canonicalUrl('http://e.com/a')).toBe(canonicalUrl('https://e.com/a'))
  })

  it('sorts query parameters so order does not matter', () => {
    expect(canonicalUrl('https://e.com/a?b=2&a=1')).toBe(canonicalUrl('https://e.com/a?a=1&b=2'))
  })

  it('drops the fragment', () => {
    expect(canonicalUrl('https://e.com/a#section')).toBe('https://e.com/a')
  })

  it('returns the input unchanged when it is not a URL', () => {
    expect(canonicalUrl('not a url')).toBe('not a url')
  })
})

describe('itemId', () => {
  it('is stable across runs', () => {
    expect(itemId('https://e.com/a')).toBe(itemId('https://e.com/a'))
  })

  it('ignores every difference canonicalization removes', () => {
    expect(itemId('https://WWW.E.com/a/?utm_source=x')).toBe(itemId('https://e.com/a'))
  })

  it('differs for different articles', () => {
    expect(itemId('https://e.com/a')).not.toBe(itemId('https://e.com/b'))
  })

  it('is hex only, so it is always a safe filename', () => {
    expect(itemId('https://e.com/../../etc/passwd')).toMatch(/^[0-9a-f]{12}$/)
  })
})
