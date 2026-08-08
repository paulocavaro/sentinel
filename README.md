# Sentinel

A daily edition of AI and world news.

Every morning a pipeline reads thirteen sources, a model picks the twenty items
that matter and ranks them, and the result is committed to this repository as a
dated JSON file. The site is static and serves the day.

Twenty items. Then the day ends.

- **No infinite scroll.** An edition has a bottom, and finishing it is possible.
- **Honest search.** Ask about anything across the archive. If it isn't there,
  the answer says so rather than inventing one.
- **Never publishes broken.** If the pipeline fails, yesterday's edition stays
  live, marked as yesterday's.

See [`docs/spec.md`](docs/spec.md) for the full specification.

## Status

In development.

## License

MIT
