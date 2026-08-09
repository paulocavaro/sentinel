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

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
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
