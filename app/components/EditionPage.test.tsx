import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { edition } from '@/app/__fixtures__/archive'

// `EditionPage` mounts the chip row, which is a client component reading the
// address bar. The clamp between the two is `ThemeFilter.test.tsx`'s subject;
// here the query string exists only because the chip counts are not printed on
// the chips — they are announced, and only for the theme in the URL.
const url = { params: new URLSearchParams() }

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useSearchParams: () => url.params,
}))

beforeEach(() => {
  url.params = new URLSearchParams()
})

const { CloseBlock, EditionPage } = await import('./EditionPage')

const html = renderToStaticMarkup

// Both routes render this component: `/` reads the latest edition and
// `/day/[date]` reads the one it was asked for. The difference between the
// front page and an archive day is entirely which edition and which day the
// page is meant to be current for — which is the `today` prop, and the two
// things it decides are checked first.

describe('EditionPage', () => {
  const day = edition('2026-08-09', 6, { themes: ['ai', 'world'] })

  describe('the stale banner', () => {
    it('appears when the newest edition is not today’s', () => {
      const stale = html(<EditionPage edition={day} dates={[day.date]} today="2026-08-11" />)

      expect(stale).toContain('class="stale-banner"')
      expect(stale).toContain('You are reading Sunday 9 August.')
      // The next run is the morning after the day being read on, not after the
      // edition: the banner is only reachable once today's run has failed.
      expect(stale).toContain('dateTime="2026-08-12T09:23Z"')
    })

    it('does not appear when the edition is today’s', () => {
      const fresh = html(<EditionPage edition={day} dates={[day.date]} today="2026-08-09" />)

      expect(fresh).not.toContain('stale-banner')
    })

    // An archive day asked for by name is never stale, it is simply that day. A
    // banner there would tell a reader of 8 August that today's edition did not
    // build.
    it('does not appear on an archive day', () => {
      const archived = html(<EditionPage edition={day} dates={[day.date]} today={null} />)

      expect(archived).not.toContain('stale-banner')
    })
  })

  describe('the chip row', () => {
    const page = html(<EditionPage edition={day} dates={[day.date]} today={null} />)

    it('prints one chip per theme below the lead', () => {
      expect(page).toContain('href="?theme=ai#ai"')
      expect(page).toContain('href="?theme=world#world"')
    })

    // Six items alternating ai/world, so three of each. The lead is item 1, an
    // ai item, and it is removed before grouping — leaving two ai and three
    // world. The chips count what the filtered view shows, so they count the
    // sections and not the themes: an ai chip reading 3 would be one higher
    // than the list underneath it.
    it('counts the section, not the theme — the lead is in neither', () => {
      url.params = new URLSearchParams('?theme=ai')
      expect(html(<EditionPage edition={day} dates={[]} today={null} />)).toContain(
        'Showing 2 items in Artificial intelligence.',
      )

      url.params = new URLSearchParams('?theme=world')
      expect(html(<EditionPage edition={day} dates={[]} today={null} />)).toContain(
        'Showing 3 items in The world.',
      )
    })

    // A theme carried by the lead alone produces no section, so a chip for it
    // would filter to an empty page.
    it('has no chip for a theme only the lead carries', () => {
      const soleLead = edition('2026-08-09', 4, { themes: ['ai'] })
      const withLoner = {
        ...soleLead,
        items: soleLead.items.map((value, i) => (i === 0 ? { ...value, theme: 'games' as const } : value)),
      }

      const rendered = html(<EditionPage edition={withLoner} dates={[]} today={null} />)

      expect(rendered).toContain('href="?theme=ai#ai"')
      expect(rendered).not.toContain('theme=games')
    })

    // `content/days/2026-08-08.json` predates the field entirely. No themes, no
    // row: a control that filters to nothing is worse than an absent one.
    it('is absent from an edition with no themes at all', () => {
      const themeless = html(
        <EditionPage edition={edition('2026-08-08', 4)} dates={[]} today={null} />,
      )

      expect(themeless).not.toContain('class="themes"')
      expect(themeless).toContain('class="item lead"')
    })
  })
})

describe('CloseBlock', () => {
  // The mark is `items.length`, never `TARGET_COUNT`: a thin day printing thirty
  // over seventeen items would be the page contradicting itself in its largest
  // type. And it is aria-hidden — "-30-" read aloud is noise.
  it('marks the end with the count the page actually holds', () => {
    const thin = html(<CloseBlock edition={edition('2026-08-11', 17, { targetCount: 30 })} />)

    expect(thin).toContain('<p class="close-mark" aria-hidden="true">-17-</p>')
    expect(thin).toContain('<span class="sr-only">End of edition.</span>')
  })

  // Spelled rather than printed, because this is prose: the masthead's machine
  // face two inches up the page says `17 items`, and the split between the two
  // is the whole reason `lib/words.ts` exists.
  it('spells the count out on a thin day, and says why', () => {
    const thin = html(<CloseBlock edition={edition('2026-08-11', 17, { targetCount: 30 })} />)

    expect(thin).toContain(
      'That was Tuesday 11 August. Seventeen items — the window was thin.',
    )
  })

  // `targetCount` is read off the edition, never off the constant: it was twenty
  // when `2026-08-08.json` was written, so measuring against thirty would label
  // a complete twenty-item edition thin, permanently.
  it('says nothing about the window on a complete day', () => {
    const full = html(<CloseBlock edition={edition('2026-08-09', 30, { targetCount: 30 })} />)

    expect(full).toContain('That was Sunday 9 August.')
    expect(full).not.toContain('the window was thin')
  })

  it('says "item" rather than "items" for a day of one', () => {
    const single = html(<CloseBlock edition={edition('2026-08-09', 1, { targetCount: 30 })} />)

    expect(single).toContain('One item — the window was thin.')
  })

  it('names the next edition by the closing time', () => {
    expect(html(<CloseBlock edition={edition('2026-08-09', 30)} />)).toContain(
      'Next edition 09:23 tomorrow',
    )
  })
})
