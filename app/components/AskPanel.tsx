// The ask panel: the drawer that phase 03's conversational search will live in,
// standing here with its field turned off.
//
// It is a bare `<dialog>` and nothing else. `showModal()` supplies Escape, a
// focus trap, an inert background, a real backdrop and returning focus to the
// opener — the five things a hand-rolled drawer gets wrong — and every one of
// them is the browser's, not this file's. The only script in the whole feature
// is the `showModal()` call in `AskButton`.
//
// **`display` stays scoped to `[open]` in `app/globals.css`.** A bare
// `display: flex` on a dialog overrides the UA's `display: none` for the closed
// state, so the panel renders open from page load and can never be closed —
// that is in this repo's history, the stylesheet carries the fix and the comment
// beside it, and nothing here reintroduces it. Nothing in this file styles the
// element at all.
//
// **The field is disabled, and the panel says why.** Search does not exist yet;
// an input that takes a question and does nothing with it is the product
// breaking its own honesty principle in the one component the principle is
// named after. Disabled, it cannot accept what it cannot answer.
//
// **The reference's three example questions are not rendered this phase.** In
// `design-refs/home.html` they are `<button class="example">` whose only job is
// to put their text into the field; with no field to fill they have no job.
// Neither of the other two shapes survives contact: as `disabled` buttons they
// look exactly like live ones, because `.example` has no disabled state and
// author `color`/`cursor` beat the UA's, so they would be controls that look
// pressable and are not; as plain text they still inherit `.example`'s
// `cursor: pointer` and hover shift, which is the same lie one step quieter.
// `.example`'s CSS stays in the stylesheet for phase 03, which will render them
// for real.
//
// The same argument decides the placeholder. `.panel-input` has no disabled
// state — author `color` and `background` beat the UA's, and adding a rule
// would put a declaration in the stylesheet that the reference does not have —
// so the field looks live whether or not it is. Its placeholder is therefore
// the state rather than the reference's example question: the field says what
// it is, in the only voice a field has.

/** The dialog's id. `AskButton` points `aria-controls` at it. */
export const ASK_PANEL_ID = 'ask'

/**
 * @param ref  the dialog itself, so `AskButton` can call `showModal()` on it.
 *   A ref rather than `document.getElementById`, which is what the reference
 *   does because a static HTML file has no other option.
 */
export function AskPanel({ ref }: { ref: React.Ref<HTMLDialogElement> }) {
  return (
    <dialog className="panel" id={ASK_PANEL_ID} ref={ref} aria-label="Ask this archive">
      {/* `method="dialog"` closes the dialog on submit with no handler and no
          JavaScript, so the close button works before hydration and would keep
          working if the bundle never arrived. */}
      <form method="dialog" className="panel-head">
        <p className="panel-title">Ask this archive</p>
        <button className="panel-x" aria-label="Close">
          Close
        </button>
      </form>
      <div className="panel-body">
        <label className="panel-label" htmlFor="q">
          Ask about anything that has run in an edition.
        </label>
        <input
          className="panel-input"
          id="q"
          type="text"
          placeholder="Not built yet"
          autoComplete="off"
          disabled
          aria-describedby="ask-note"
        />
        {/* Tied to the field by `aria-describedby`: a screen reader hears the
            field is dimmed and, in the same breath, what it is waiting for. */}
        <p className="panel-note" id="ask-note">
          The search is the next thing built. It will answer from the editions
          themselves, cite the item and the day it ran, and say so when nothing
          here matches.
        </p>
      </div>
    </dialog>
  )
}
