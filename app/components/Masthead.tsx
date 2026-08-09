// The masthead: who wrote this, which day it is, what is in it.
//
// The markup is design-refs/build-home.mjs's `<header class="masthead">`,
// structure for structure. Two things about it are load-bearing:
//
//   · The weekday is its own `<span class="weekday">` because it is set in
//     --machine while the date beside it is full ink — one line, two tones, and
//     the split has to exist in the DOM for the stylesheet to reach it.
//   · Everything the `.promise` line says is derived. The count is
//     `items.length`, never a constant; the closing time is `CLOSING_TIME`,
//     which lives beside the cron it mirrors; and the thin day is `isThin`,
//     which reads the edition's own `targetCount`. Importing `TARGET_COUNT`
//     here would label the complete twenty-item edition of 8 August a thin day,
//     permanently, in the masthead.
//
// `children` is where the edition bar and the theme row go. Both sit inside the
// header in the reference, and both are somebody else's component — the bar is
// beside this file, the filter is Task 7 — so the masthead holds the slot
// rather than importing either.

import type { ReactNode } from 'react'

import { dayMonth, weekdayOf } from '@/lib/date'
import { isThin } from '@/lib/edition'
import type { Edition } from '@/lib/edition'
import { CLOSING_TIME } from '@/lib/ingest/config'

export function Masthead({ edition, children }: { edition: Edition; children?: ReactNode }) {
  // Built as one string rather than as text-plus-expression: adjacent text
  // nodes are separated by a `<!-- -->` marker in the streamed HTML, and the
  // reference has one text node here. Same reason as `Item`'s link suffix.
  const promise = [
    `${edition.items.length} items`,
    `closed ${CLOSING_TIME}`,
    ...(isThin(edition) ? ['a thin day'] : []),
  ].join(' · ')

  return (
    <header className="masthead">
      <p className="wordmark">Sentinel</p>
      <h1 className="editiondate">
        <span className="weekday">{weekdayOf(edition.date)}</span>
        {` ${dayMonth(edition.date)}`}
      </h1>
      {/* The model's own sentence about the day, set plain: no small caps and
          no lead-in. The reference escapes it and applies neither transform. */}
      <p className="manifest">{edition.summary}</p>
      <p className="promise">{promise}</p>
      {children}
    </header>
  )
}
