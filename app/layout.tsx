import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Spectral } from "next/font/google";
import "./globals.css";

// The two faces of the system. Neither is a variable font, so every weight and
// style has to be enumerated and each combination is a separate file fetched at
// build time: Spectral loads four (400 and 600, each upright and italic) and
// IBM Plex Mono loads two. That is the price of these two families and it is
// paid once, at build; next/font self-hosts the files, so no request leaves for
// Google at runtime. Adding a weight here adds a file — check the design system
// before you do.
//
// The variables are consumed in exactly one place: --face-text and
// --face-machine at the top of globals.css. Nothing else names a family.
const spectral = Spectral({
  subsets: ["latin"],
  weight: ["400", "600"],
  style: ["normal", "italic"],
  variable: "--font-spectral",
  display: "swap",
});

// `fallback` on this one face, and on this one only.
//
// Left unset, next/font puts a generated family of its own into the variable:
// `--font-ibm-plex-mono: "IBM Plex Mono", "IBM Plex Mono Fallback"`, where the
// second is `local(Arial)` with size-adjust and metric overrides to match. It
// exists to reduce layout shift while the real file loads, and it costs
// something the design did not agree to — it lands *ahead* of the
// `ui-monospace, monospace` the stylesheet wrote, so every codepoint outside
// the loaded subset renders in scaled Arial rather than in a monospace.
//
// `←` and `→` are exactly that. Google's `latin` range carries ↑ and ↓ and not
// the horizontal pair (`unicode-range: …U+2191,U+2193…`), so the edition bar's
// arrows — the two glyphs in the design that say a date can be reached — came
// out proportional and 17px wide against design-refs/home.html's 8. That was
// the only pixel difference between the rendered page and the reference, at
// either width, in either scheme.
//
// Naming the fallback replaces the generated family rather than following it,
// so the variable becomes the stack the design system actually specifies. The
// shift it stops guarding against is not a cost here: the machine face never
// sets a paragraph in this design — it carries the wordmark, the date, the
// promise line, the chips, the section names, the bylines and the closing mark,
// all short, all single-line, all with line-height a fixed ratio of a fixed
// font-size, so no block's height moves with it. Spectral keeps the generated
// fallback, because Spectral is what sets the running prose that would reflow,
// and no glyph the editions use falls outside its subset.
//
// (`adjustFontFallback: false` is the option that reads like the answer, and
// under Turbopack it is silently ignored — the generated family is still
// emitted and still wins. Verified against the built CSS, not against the
// docs.)
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
  fallback: ["ui-monospace", "monospace"],
});

// metadataBase must be absolute and the production host is not known when this
// file is written. Vercel exposes it to the build; locally the dev origin is
// the correct answer.
const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    // Every edition page sets its own date as the title; this suffixes it.
    default: "Sentinel",
    template: "%s — Sentinel",
  },
  description:
    "A daily edition of AI, world, games, science and culture news.",
  // No `icons` key: the icon is `app/icon.svg`, which the file-based metadata
  // API emits with a hashed URL on its own. Naming it here as well would emit
  // a second, unhashed <link> for the same file.
};

// The theme colour is set here and not in `metadata`. `Metadata.themeColor` is
// deprecated as of Next 14, still typechecks, and is silently not emitted — it
// logs a build warning and nothing else, so the build would be green and the
// two tags simply absent. The colours are --paper in each scheme, so the
// browser chrome matches the paper instead of framing it in white.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F2F0EB" },
    { media: "(prefers-color-scheme: dark)", color: "#16171A" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${spectral.variable} ${ibmPlexMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
