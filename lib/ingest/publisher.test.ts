import { describe, expect, it } from 'vitest'
import { publisherFromUrl } from './publisher'

describe('publisherFromUrl', () => {
  it('names the outlet the article is actually on, not the feed that found it', () => {
    // The bug this function exists for: seven items in the first real edition
    // were bylined "Hacker News" and opened on somebody else's site.
    expect(publisherFromUrl('https://www.reuters.com/business/retail-consumer/alibaba-plans')).toBe(
      'Reuters',
    )
    expect(publisherFromUrl('https://deepmind.google/blog/weathernext')).toBe('Google DeepMind')
    expect(publisherFromUrl('https://news.ycombinator.com/item?id=1')).toBe('Hacker News')
  })

  it('uses the pretty name for hosts whose spelling is not mechanical', () => {
    expect(publisherFromUrl('https://techcrunch.com/2026/08/07/x')).toBe('TechCrunch')
    expect(publisherFromUrl('https://arstechnica.com/ai/x')).toBe('Ars Technica')
    expect(publisherFromUrl('https://www.theguardian.com/us-news/x')).toBe('The Guardian')
    expect(publisherFromUrl('https://openai.com/index/x')).toBe('OpenAI')
    expect(publisherFromUrl('https://huggingface.co/blog/x')).toBe('Hugging Face')
    expect(publisherFromUrl('https://www.technologyreview.com/2026/08/07/x')).toBe(
      'MIT Technology Review',
    )
    expect(publisherFromUrl('https://simonwillison.net/2026/Aug/7/pdfs')).toBe('Simon Willison')
    expect(publisherFromUrl('https://www.cnn.com/2026/08/04/tech/x')).toBe('CNN')
    expect(publisherFromUrl('https://www.scientificamerican.com/article/x')).toBe(
      'Scientific American',
    )
    expect(publisherFromUrl('https://www.nytimes.com/2026/08/07/x')).toBe('The New York Times')
    expect(publisherFromUrl('https://www.wsj.com/tech/x')).toBe('The Wall Street Journal')
    expect(publisherFromUrl('https://www.theverge.com/2026/8/7/x')).toBe('The Verge')
    expect(publisherFromUrl('https://www.wired.com/story/x')).toBe('WIRED')
    expect(publisherFromUrl('https://www.bloomberg.com/news/articles/x')).toBe('Bloomberg')
  })

  // Both of these shipped in a published edition under the mechanical name —
  // "Quantamagazine" and "Gamesindustry" — and were found by reading the archive
  // rather than by any test failing. A hostname of two words run together has no
  // seam to split on, so the fallback can only capitalise what it was handed;
  // the list above is the only thing that can know better. Kept as a case of
  // their own because the reason they were missed is the reason the next one
  // will be: nothing goes wrong, the byline is just quietly not the outlet's
  // name.
  it('names the two outlets that were shipping under a run-together hostname', () => {
    expect(publisherFromUrl('https://www.quantamagazine.org/x-20260809/')).toBe('Quanta Magazine')
    expect(publisherFromUrl('https://www.gamesindustry.biz/x')).toBe('GamesIndustry.biz')
  })

  it('reaches the pretty name through any subdomain the feed happens to use', () => {
    // The two BBC hosts in SOURCES and in real article links.
    expect(publisherFromUrl('https://feeds.bbci.co.uk/news/world/rss.xml')).toBe('BBC')
    expect(publisherFromUrl('https://www.bbc.co.uk/news/articles/cewr898jy8go')).toBe('BBC')
    expect(publisherFromUrl('https://feeds.npr.org/1004/rss.xml')).toBe('NPR')
    expect(publisherFromUrl('https://www.npr.org/2026/08/06/nx-s1-5923623/iran')).toBe('NPR')
    expect(publisherFromUrl('https://edition.cnn.com/2026/08/04/tech/x')).toBe('CNN')
  })

  it('prefers the most specific host, so a section subdomain can have its own name', () => {
    expect(publisherFromUrl('https://finance.yahoo.com/technology/ai/articles/x')).toBe(
      'Yahoo Finance',
    )
    // yahoo.com itself is not in the lookup, so the parent falls back mechanically
    // rather than inheriting the subdomain's name.
    expect(publisherFromUrl('https://sports.yahoo.com/x')).toBe('Yahoo')
  })

  it('falls back mechanically for a host nobody has named', () => {
    expect(publisherFromUrl('https://app.dealroom.co/news/feed/oracle-bans')).toBe('Dealroom')
    expect(publisherFromUrl('https://mezha.net/eng/bukvy/ca117584_denmark')).toBe('Mezha')
    expect(publisherFromUrl('https://some-blog.net/post/1')).toBe('Some Blog')
  })

  it('does not mistake a multi-part public suffix for the name', () => {
    // The whole reason the suffix list exists: naively "the second-to-last
    // label" turns every British outlet into "Co".
    expect(publisherFromUrl('https://www.somepaper.co.uk/news/x')).toBe('Somepaper')
    expect(publisherFromUrl('https://news.example.com.au/x')).toBe('Example')
  })

  it('ignores case, a leading www. and a trailing root dot', () => {
    expect(publisherFromUrl('https://WWW.Reuters.COM/article/x')).toBe('Reuters')
    expect(publisherFromUrl('https://reuters.com./article/x')).toBe('Reuters')
  })

  it('never returns an empty string, whatever it is handed', () => {
    // A blank byline on a card is worse than an honest one, and this value is
    // written to the permanent archive.
    for (const input of ['', 'not a url', 'mailto:someone@example.com', 'https://', '///', 'x']) {
      expect(publisherFromUrl(input)).not.toBe('')
    }
    expect(publisherFromUrl('not a url')).toBe('Unknown source')
    expect(publisherFromUrl('mailto:someone@example.com')).toBe('Unknown source')
  })

  it('returns the host itself when there is no name to derive', () => {
    expect(publisherFromUrl('https://192.168.0.1/x')).toBe('192.168.0.1')
    expect(publisherFromUrl('https://localhost/x')).toBe('Localhost')
  })

  it('is stable: the same URL always gives the same publisher', () => {
    expect(publisherFromUrl('https://www.reuters.com/a')).toBe(
      publisherFromUrl('https://www.reuters.com/b?utm_source=x'),
    )
  })
})
