import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The editions have to be traced into the server bundle, and nothing can
  // work that out by reading the code.
  //
  // `lib/edition.ts` reads `join(process.cwd(), CONTENT_DIR)` and then a
  // filename built from a route segment. Static analysis cannot follow that to
  // a set of files, so `content/days/*.json` is not a module dependency of any
  // route and is not traced into any function bundle. Every route in this app
  // is prerendered today, so the build is green and `next dev` — which serves
  // straight from the source tree — is green too; the failure is a production
  // `ENOENT` the first time anything renders at request time. Task 11's deploy
  // hook, a future ISR revalidation, a route that starts reading `headers()`:
  // any of those turns a green build into a site that 500s on its own archive.
  //
  // So the dependency is declared. Keys are route globs and values are globs
  // resolved from the project root — `/**` is every route, because every route
  // in this app is an edition page or one hop from one.
  //
  // This does **not** silence the `Dynamic filesystem access causes tracing of
  // the whole project` warning that Turbopack emits for that `join`. That
  // warning is a static-analysis result about the source and it is emitted
  // whatever this config says; it reports the opposite risk — that everything,
  // including `public/`, gets swept into the trace. The two are complementary
  // and the include is the half that is load-bearing: it names the files that
  // must be there rather than relying on an over-broad trace to catch them.
  outputFileTracingIncludes: {
    "/**": ["./content/days/**"],
  },
};

export default nextConfig;
