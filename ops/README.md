# Ops Punch List — 2026-04-25

| # | File | What | Status |
|---|---|---|---|
| 1 | [`CRON-DIAGNOSIS.md`](./CRON-DIAGNOSIS.md) | `Fetch Notion data` workflow has failed 11 days running. Root-caused via GH Actions API: step 5 dies in 8 s, classic auth fail. | ⚠️ **token rotation pending — only blocker** |
| 2 | [`NOTION-QUICK-FIXES.md`](./NOTION-QUICK-FIXES.md) | Estab dedup + Zak Tales technique. | ✅ already done in Notion (audit was stale) |
| 3 | [`WATCH-LINK-HARDENING.md`](./WATCH-LINK-HARDENING.md) | Policy classifier mapped to the **actual** Notion schema (`Verified`/`Restricted`/`Broken`, not invented statuses). Wired into the cron. | ✅ shipped |
| 4 | [`DIRECTOR-NORMALIZATION.md`](./DIRECTOR-NORMALIZATION.md) | 192-cluster worksheet from the audit. | ⏸ deferred — re-run audit on fresh data first; many entries may already be cleaned |
| 5 | [`FILMS-INDEX-TRIM.md`](./FILMS-INDEX-TRIM.md) | Bundle trim plan. | ❌ Tier 1 attempted then reverted — `studioEntities`/`directorEntities` ARE used by `app.js` (preferred path with name-lookup fallback). Tier 4 (defer load) is the real win, untouched. |

## What changed in this session

**Code:**
- `scripts/lib/platform-trust.js` — new file, classifies (platform, url) pairs against the live Notion `Link Status` vocabulary.
- `scripts/validate-watch-links.js` — uses the classifier; drains legacy `Dead`/`Redirect` → `Broken`; clears `Last Verified` for non-`Verified` writes.
- `.github/workflows/fetch-data.yml` — added `validate-watch-links --fix` + watch-links re-fetch after the main fetch, before audit.

**Verified by:**
- `node --check` on both touched scripts (clean).
- 14 sanity tests against `classifyByPolicy` (all pass).
- Notion MCP fetch confirms the `Link Status` schema matches what the code writes.

**Notion (via MCP):**
- Confirmed Estab-Life duplicate `8030c847…` is already trashed.
- Confirmed Zak Tales has `Technique: Puppet` set.
- No write operations performed — the existing audit stale state is the only "issue" and it self-resolves on the next cron tick.

## What's left for you

1. Rotate `NOTION_TOKEN`. ~5 min. Step-by-step in `NOTION-QUICK-FIXES.md` §3.
2. Trigger one manual cron run to confirm the new pipeline ships clean. ~2 min.
3. (Optional) Run the director normalization pass once the new audit lands and you can see what's actually still dirty.

## What I won't pretend to have done

- Did not edit Notion directly — your DB, your call on bulk director merges. The MCP could do it but it's worth your eyes given how many false positives the audit clustering produced.
- Did not ship the `films-index.js` trim — my earlier doc was wrong about what fields were dead. The bundle is the same size as before.
- Did not implement the `Restricted` lock-icon UI in `build-site.js` — that's a small follow-up after the data lands so we can see what the new states look like in practice.
