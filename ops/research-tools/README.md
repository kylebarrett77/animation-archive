# Research tools (validation sessions)

Helpers used in validation sessions 186–187 (2026-11-27) to promote Queue items into Films under the Validation Protocol. They expect research drafts in the batch JSON format described in `promote.mjs`.

- `verify-batch.mjs <batch.json>`: checks that each IMDb ID resolves (via TMDB) to the right title and year, that each Wikipedia URL is the work's own article, that required fields are present, and the source counts.
- `entities.mjs <batch.json> '<director→studios JSON>'`: re-checks the live Directors/Studios databases, creates only missing entity pages (schema-guarded), and links Director↔Studio.
- `promote.mjs <batch.json> <session#> [--dry]`: re-runs the duplicate check against live Films, validates every select value against the live schema, then creates the Films page (house-style content), any watch links (Unverified), and updates the Queue item (Validated + Film DB Entry + note) in the same pass.
- `schema-guard.mjs`: rejects select/multi-select values not already in the schema, so drafts can never create stray options.

Paths still point at a session scratchpad (`S`) for drafts and the entity-ID map. Set `S` before reusing them.
