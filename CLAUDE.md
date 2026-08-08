@AGENTS.md

# dev-loop

This project is built with [dev-loop](https://github.com/paulocavaro/dev-loop).
Feature work runs as staged phases with explicit gates. The project contract
lives in `.loop/config.md` — gate commands, screens map, providers, extra rules.

## The four stages

| Stage | Command | What runs | Gate |
|---|---|---|---|
| 1 Think | `/think-phase` | the interrogate provider shapes the idea into `design.md` | **human** |
| 2 Plan | `/plan-phase` | plan written from the template, then reviewed by the plan_review provider | **human** |
| 3 Build | `/execute-phase` | maker subagent per task, automated gate + atomic commit per task, `loop-verify` per screen, review battery at the end | automated |
| 4 Ship | on your go | the ship provider — tests, changelog, push, PR | **human** |

`/loop "<task>"` is the front door: it triages the task, suggests an effort tier
and runs the whole thing. `/verify-screen <screen> <web>` runs the visual loop
standalone.

## Effort tiers

- **quick** — no interrogation, inline mini-plan, change made directly, no
  end-of-phase battery
- **standard** — interrogation and plan review, maker subagent per task, gate +
  code review
- **high** — same, deeper verify cap, adds QA
- **ultra** — adds security review and the checklist

The tier scales dev-loop's own depth — which roles run, the verify iteration cap,
how granular the build is. It does not dictate how hard a provider works.
`/loop` suggests a tier and you can override with `--quick`, `--standard`,
`--high`, `--ultra`. **Default here is `standard`, ceiling is `ultra`**, and a run
may escalate one step if the task turns out bigger than estimated.

## Providers

dev-loop is agnostic to the specialist toolchain: it knows only abstract roles,
and `## Providers` in `.loop/config.md` maps each one to whatever skill you
named. A role left unset is skipped, not filled by a default.

## Commits

Atomic commits on a branch, one per completed task. Pushing, opening a PR and
merging are human decisions — never automatic.
