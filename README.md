# Sentinel

A daily edition of AI and world news.

Every morning a pipeline reads eleven sources, a model picks the twenty items
that matter and ranks them, and the result is committed to this repository as a
dated JSON file. The site is static and serves the day.

Twenty items. Then the day ends.

- **No infinite scroll.** An edition has a bottom, and finishing it is possible.
- **Honest search.** Ask about anything across the archive. If it isn't there,
  the answer says so rather than inventing one.
- **Never publishes broken.** If the pipeline fails, yesterday's edition stays
  live, marked as yesterday's.

See [`docs/spec.md`](docs/spec.md) for the full specification.

## How it runs

`pnpm ingest` builds the edition for the current UTC date into
`content/days/YYYY-MM-DD.json`, with the images it kept under `public/img/`. It
writes nothing at all unless every validation passes, so a bad day leaves the
previous edition live rather than publishing a broken one.

| Flag | What it does |
| --- | --- |
| `--force` | Rebuild today's edition even though one already exists |
| `--dry-run` | Curate and validate, then write nothing |
| `--summary-json=<path>` | Also write the run's numbers as JSON, for a job to read |

`ANTHROPIC_API_KEY` is required on every path, including `--dry-run` — the run
curates before it knows whether it has anything to publish.

[`.github/workflows/daily.yml`](.github/workflows/daily.yml) runs the same
command at 09:23 UTC, commits the result as `github-actions[bot]` and pushes.
Vercel builds from that push; nothing in the workflow deploys anything.

Every run writes its numbers — candidates, source failures, unparseable dates,
how many items were chosen, where they went — into the GitHub job summary. A
failed run commits nothing and reports itself on a **single** tracking issue
labelled `ingest-failure`, updated by comment rather than reopened daily.

The API key lives only in Actions (`gh secret set ANTHROPIC_API_KEY`). The site
itself is static and needs no environment variables.

## Status

In development.

## License

MIT
