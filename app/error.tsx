"use client"; // An error boundary has to be a Client Component. Next requires it.

import Link from "next/link";

// The one surface the reader can reach that the design never drew. It says what
// failed, gives the digest so the failure can be found in the logs, and points
// at something that works. No apology and no "please try again later": the
// product's voice is a record's, and a record states.
//
// There is deliberately no retry control. Next hands this component a `retry`,
// but every route here is prerendered — a re-render produces the same payload
// and so the same failure — and the design system has no button. The recovery
// is the link, which unmounts the boundary on navigation.
export default function Error({ error }: { error: Error & { digest?: string } }) {
  return (
    <div className="page">
      <header className="masthead">
        <p className="wordmark">Sentinel</p>
        <h1 className="editiondate">This page did not render</h1>
        <p className="promise">
          {error.digest ? `Failure ${error.digest}` : "Failure"}
        </p>
        {/* Upright, as in not-found.tsx: the italic on .manifest belongs to the
            model's editorial line, and this is the product speaking. */}
        <p className="manifest" style={{ fontStyle: "normal" }}>
          The archive is unharmed — every edition is a file in a repository and
          nothing here writes to it. Reloading may be enough; the latest edition
          is one link away.
        </p>
        <div className="editionbar">
          <nav className="days" aria-label="Editions">
            <Link className="day day-all" href="/">
              Latest edition
            </Link>
          </nav>
        </div>
      </header>
    </div>
  );
}
