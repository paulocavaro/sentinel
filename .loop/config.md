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
| screen | web route          | reference             |
|--------|--------------------|-----------------------|
| home   | /                  | design-refs/home.html |
| day    | /day/2026-08-08    | design-refs/day.html  |
| states | /states            | design-refs/states.html |

> `ask` is a panel, not a route: a `<dialog>` opened from a floating button, so
> it is a state of whatever page you are on rather than a screen of its own.
>
> `day` is pinned at a date, not left as `/day/[date]`, and it has a reference
> of its own. It used to point at `home.html` on the reasoning that an archive
> day is the same page with a different date — but the two committed editions
> are not the same shape. 8 August is pre-theme: twenty items, no `theme` field
> on any of them, six with no image, so it renders one lead, four features and
> fifteen briefs in a single unlabelled group. Judged against a thirty-item
> themed page it fails while being perfectly correct. It is not a copy that
> drifts: `design-refs/build-home.mjs` writes both files, `home.html` from the
> latest edition and `day.html` from the date given on argv, so the difference
> between them is entirely the data.
>
> `states` is the catalogue of the eight conditions that are not an ordinary
> day, verified as a page in its own right so those states cannot rot unseen.

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
