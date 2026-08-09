// Vitest's own config, which exists for exactly one reason: the `@/` alias.
//
// Nothing under `lib/` needed it — those modules import each other relatively,
// so `vitest run` worked with no config at all. The components under `app/` are
// written against `@/lib/...`, which is `tsconfig.json`'s `paths` entry, and
// Vitest does not read `tsconfig.json` for resolution. Without the alias below,
// a test that imports a component fails at import time with "Failed to resolve
// import" and nothing about the failure mentions the alias.
//
// `environment` is deliberately left at `node`. The tests render components
// with `renderToStaticMarkup` from `react-dom/server` — the pattern
// `lib/typeset.test.tsx` established — because that is what these routes
// actually do: every one of them is prerendered to HTML at build time. A jsdom
// environment would test a DOM the reader never receives, and would cost a
// dependency to do it.

import { resolve } from 'node:path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': resolve(import.meta.dirname) },
  },
})
