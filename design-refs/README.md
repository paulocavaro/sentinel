# design-refs

Approved design screens, as self-contained HTML. One file per screen in the
dev-loop screens map (`.loop/config.md`).

These are the visual source of truth: `loop-verify` captures the implemented
screen and compares it against the reference here. A screen without a reference
falls back to review mode against `docs/design-system.md`.

Written by the design phase, not by hand. Regenerate with:

```
node design-refs/build-home.mjs              # latest edition → home.html
node design-refs/build-home.mjs 2026-08-08   # that edition   → day.html
node design-refs/build-states.mjs            # reads the CSS out of home.html
```

`build-states.mjs` lifts its stylesheet from `home.html`, so run it last.
`app/globals.css` is the same stylesheet again — the only differences are the
two `--face-*` lines, which point at next/font variables there, and the
catalogue chrome that `/states` needs at runtime. Change CSS in the generator,
regenerate, then carry the change across.
