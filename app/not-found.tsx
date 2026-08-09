import Link from "next/link";

// A 404 is not one of the eight designed states. It is not a day the pipeline
// missed and not a day whose edition will not read — both of those are
// NoEdition, which is a real date and gets the archive's vocabulary — it is an
// address that was never part of the site. It borrows the
// shape of states.html 03 all the same: the masthead says what is true in the
// place the date normally goes, and the one link points somewhere that exists.
//
// The sentence and the link are a `<main class="wayout">`, as they are on every
// page here that is not an edition. See `NoEdition`, which was the component
// this shape was taken from, and `.wayout` in the stylesheet for why the split
// costs no pixels.
export default function NotFound() {
  return (
    <div className="page">
      <header className="masthead">
        <p className="wordmark">Sentinel</p>
        <h1 className="editiondate">No such page</h1>
        <p className="promise">Nothing at this address</p>
      </header>

      <main className="wayout" id="results">
        {/* .manifest is italic because it usually carries the model's editorial
            line. This sentence is the product speaking, so it stands upright —
            the same override states.html 03 makes on the same element. */}
        <p className="manifest" style={{ fontStyle: "normal" }}>
          Sentinel has a front page, one page for each edition it has published,
          and an archive listing every date. This address is none of them.
        </p>
        <div className="editionbar">
          <nav className="days" aria-label="Editions">
            <Link className="day day-all" href="/">
              Latest edition
            </Link>
          </nav>
        </div>
      </main>
    </div>
  );
}
