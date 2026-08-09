// The round button in the corner, and the only script the ask feature has.
//
// It is a Client Component because `showModal()` is a DOM call and there is no
// declarative way to open a modal dialog. The boundary is deliberately two
// components wide — this button and the panel it opens — and holds no data:
// everything above it stays a Server Component, so the edition is still one
// prerendered document with a button bolted to the corner of it.
//
// `showModal()` rather than `show()` or a `open` attribute: only the modal path
// gives the top layer, the backdrop, the inert page behind, Escape, the focus
// trap, and focus returning to this button on close. Nothing below is
// hand-written, and nothing below should be.

'use client'

import { useRef } from 'react'

import { AskPanel, ASK_PANEL_ID } from './AskPanel'

/**
 * The ask launcher and its panel, rendered as siblings. Both are
 * `position: fixed`, so the caller places this wherever it reads best in the
 * document order — `EditionPage` puts it after the closing block, which is
 * where a reader who has finished the day would look for it.
 */
export function AskButton() {
  const panel = useRef<HTMLDialogElement>(null)

  return (
    <>
      {/* `aria-haspopup="dialog"` and `aria-controls` as the reference has
          them: the first says what pressing this does, the second says to
          what. `type="button"` because a `<button>` inside any future form
          would otherwise submit it. */}
      <button
        className="ask-fab"
        type="button"
        aria-haspopup="dialog"
        aria-controls={ASK_PANEL_ID}
        onClick={() => panel.current?.showModal()}
      >
        {/* The word is the whole icon — the system has no icon set. The rest of
            the accessible name is visually hidden rather than an aria-label, so
            the visible word stays the start of the name a voice-control user
            speaks. */}
        <span className="ask-fab-word">Ask</span>
        <span className="sr-only"> this archive</span>
      </button>
      <AskPanel ref={panel} />
    </>
  )
}
