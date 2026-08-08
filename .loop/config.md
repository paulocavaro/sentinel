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
- engine: browse                    # gstack browse daemon; chrome-plugin as fallback
- refs_dir: design-refs             # approved design HTML, one file per screen
- spec_docs:
  - docs/spec.md
  - docs/design-system.md           # written once the design direction is approved
- max_iterations_per_screen: 6

> `design-refs/` is empty until the design phase produces the approved screens.
> Until then loop-verify runs in review mode against `spec_docs`.

## Screens map
| screen | web route     | reference                  |
|--------|---------------|----------------------------|
| home   | /             | design-refs/home.html      |
| day    | /day/[date]   | design-refs/day.html       |
| ask    | /ask          | design-refs/ask.html       |

> Whether `ask` is a full route or a launcher pinned to the corner is decided in
> the design phase. If it becomes a launcher, this row's route changes to `/`
> with the launcher open.

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

## Providers
- interrogate: builtin
- plan_review: builtin
- code_review: builtin
- qa: gstack:qa
- security_review: gstack:cso
- design_review: gstack:design-review
- ship: gstack:ship

## Extra rules
- All UI work loads the design skills: `frontend-design`, `impeccable`,
  `taste-skill` and `ui-ux-pro-max` (all global). One design direction is
  produced and approved by the human before any production UI is written; the
  approved direction is documented in `docs/design-system.md` and saved as HTML
  under `design-refs/`.
- Next 16 differs from model training data. Read the relevant guide under
  `node_modules/next/dist/docs/` before writing routing, caching or data-fetching
  code. Do not rely on recalled Next.js APIs.
- UI copy and repository docs in English. Commits in English.
- No emojis in production UI; icons from one icon family only.
- Mobile-first: layouts are designed at 390px first, then scaled up.
- Dark and light themes are both first-class from the first version.
- The daily pipeline must never publish a partial or invalid edition: if any
  step fails, write nothing and leave the previous edition live.
