# How this site reaches production

One path, on purpose. This file exists because the answer was not obvious and
cost an afternoon to establish.

## The rule

**Only `.github/workflows/deploy.yml` promotes `main`.** Vercel's automatic
git deployment is turned off for `main` in `vercel.json`; every other branch
still gets its preview as usual.

```
push / merge to main ──▶ deploy.yml ──▶ VERCEL_DEPLOY_HOOK ──▶ production
                                              ▲
     daily ingest, after pushing an edition ───┘   (calls the same hook itself)
```

## Why not just let Vercel deploy on push

It does, and it is not reliable for the case that matters.

**Vercel skips a build when the commit's tree is identical to one it has already
built.** That is not an edge case here — it is what an ordinary pull-request
merge produces. The branch head was built as a preview; the merge commit that
follows has the same tree whenever `main` has not moved; Vercel recognises the
tree and does nothing. Phase 03 merged and stayed off the site for eleven minutes
until somebody fired the hook by hand, and nothing anywhere reported a failure —
there was no failed deployment, there was no deployment.

Measured, from the Vercel API:

```
18:23:37Z  merge lands on main
18:29:00Z  checked: site still serving the previous phase, no deployment exists
18:34:21Z  production ← the hook, fired by hand
18:57:33Z  production ← git integration    ┐ a later commit with a NEW tree,
18:57:39Z  production ← deploy.yml         ┘ built twice
```

So the git integration misses exactly the merges, and doubles everything else.
Turning it off for `main` leaves one caller and one build.

## Why the workflow fails loudly

`daily.yml` calls the same hook under `if: always()` and deliberately does *not*
fail when it errors: there the hook is a safety net around the edition, and a
failed hook must not turn a good edition into a red run.

`deploy.yml` is the opposite. The hook is the whole job, so a green run that
deployed nothing would be the exact failure the file exists to prevent — the same
shape as the `git diff` bug in phase 01, where every signal said healthy and the
site never updated. It exits non-zero on a missing secret, an unreachable hook,
or any status that is not 200 or 201.

## Why the bot is skipped

The daily ingest pushes its edition to `main` and then calls the hook itself.
Without `if: github.actor != 'github-actions[bot]'` every published edition would
deploy twice — once from that step, once from this workflow reacting to its push.
Each path keeps exactly one caller: the ingest promotes its own edition, the
workflow promotes everything a human merges.

## If production stops updating

Check, in this order:

1. **Actions → Deploy.** A red run names the reason; the hook's status code is in
   the log.
2. **`VERCEL_DEPLOY_HOOK` exists** as a repository secret and still points at
   `main`. Vercel → project → Settings → Git → Deploy Hooks.
3. **`vercel.json` still disables `main`.** If someone removes it, deployments
   come back — doubled, and still missing on merges.

To promote by hand without waiting for anything: re-run the last **Deploy** job,
or dispatch `daily.yml`, which calls the same hook whatever the ingest does.
