// The photograph, and the decision to render nothing at all without one.
//
// About a third of items arrive with no usable image, so the empty case is an
// ordinary day rather than an exception. It renders **no element** — not an
// empty span, not a placeholder box — because `.item:not(:has(.plate)) .head`
// and `.lead:not(:has(.plate)) .body` are what give the headline the space the
// picture would have had, and `:has(.plate)` matches an empty `<span class=
// "plate">` exactly as happily as a full one. A placeholder would leave the
// card with a hole in it, which is the thing `design-system.md` refuses.

/** 16:9 under the lead, 3:2 under a feature. A brief carries no plate at all. */
export type PlateVariant = 'lead' | 'feature'

export function Plate({ image, variant }: { image: string | null; variant: PlateVariant }) {
  if (image === null) return null

  return (
    <span className={`plate plate-${variant}`}>
      {/* Plain <img>, on purpose: the pipeline already resized to 800px and
          re-encoded to WebP, the aspect ratio is held in CSS so there is no
          layout shift, and next/image would need configuration to redo work
          that is done. `design.md` refuses it by name. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="art" src={image} alt="" loading="lazy" decoding="async" />
    </span>
  )
}
