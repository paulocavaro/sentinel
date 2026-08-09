# dev-loop config

## Artifacts
- plans_dir: docs/plans
- phase_folder: <NN>-<slug>
- design_doc: design.md
- plan_doc: implementation.md
- product_design: docs/spec.md

## Run
- web: `pnpm dev` → http://localhost:3000

## Automated gate
- build: `pnpm build`
- typecheck: `pnpm typecheck`
- lint: `pnpm lint`
- test: `pnpm test`

> Order matters. Next 16 generates route types (`LayoutProps` and friends) into
> `.next/types` during `next build`; `tsc --noEmit` fails on a clean tree if the
> build has not run. Always `build` → `typecheck` → `lint` → `test`.

## Visual gate
- enabled: true
- engine: browse
- refs_dir: design-refs             # approved design HTML, one file per screen
- spec_docs:
  - docs/spec.md
  - docs/design-system.md           # written once the design direction is approved

> `design-refs/` is empty until the design phase produces the approved screens.
> Until then loop-verify runs in REVIEW MODE against `spec_docs`.

## Screens map
| screen | web route     | reference                                    |
|--------|---------------|----------------------------------------------|
| home   | /             | design-refs/home.html                        |
| day    | /day/[date]   | design-refs/home.html (same page, older date)|
| states | —             | design-refs/states.html                      |

> The design phase resolved two things this map used to leave open. `ask` is a
> panel, not a route: a `<dialog>` opened from a floating button, so it is a
> state of whatever page you are on rather than a screen of its own. And an
> archive day is the same page as today with a different date, so it verifies
> against the same reference — a second file would be a copy that drifts.
>
> `states` has no route. It is the catalogue of the six conditions that are not
> an ordinary day, and it is verified as a page in its own right so those states
> cannot rot unseen.

## End of phase
- qa: http://localhost:3000
- code_review: on
- security_review: on
- checklist: WCAG AA contrast on every interactive element; loading, empty and
  error states present on every surface; no layout shift when images load.

## Ship
- enabled: true                     # merge is always human

## Tiers
- default_tier: standard
- ceiling: ultra
- escalation: on

> Verify iteration cap follows the tier defaults (standard 4, high 6, ultra 8).

## Providers
- interrogate: builtin
- plan_review: autoplan
- code_review: review
- qa: qa
- security_review: cso
- design_review: impeccable
- ship: ship

## Extra rules
- All UI work loads the design skills: `frontend-design`, `impeccable`,
  `taste-skill` and `ui-ux-pro-max`. One design direction is produced and
  approved by the human before any production UI is written; the approved
  direction is documented in `docs/design-system.md` and saved as HTML under
  `design-refs/`.
- Next 16 differs from model training data. Read the relevant guide under
  `node_modules/next/dist/docs/` before writing routing, caching or data-fetching
  code. Do not rely on recalled Next.js APIs.
- UI copy and repository docs in English. Commits in English.
- No emojis in production UI; icons from one icon family only.
- Mobile-first: layouts are designed at 390px first, then scaled up.
- Dark and light themes are both first-class from the first version.
- The daily pipeline must never publish a partial or invalid edition: if any
  step fails, write nothing and leave the previous edition live.
