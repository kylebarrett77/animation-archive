# Notion Quick Fixes

Verified live in Notion on 2026-04-25 via MCP fetch.

## 1. *Estab(-)Life: Great Escape* dedup — ✅ ALREADY DONE

The duplicate page `8030c847-93e4-43e6-8903-b7baa5be06e4` is already marked **deleted** in Notion (Notion API response carries the `<page url="..." deleted>` flag). The remaining canonical entry is `f298ffb2-78e4-4879-8919-96a6109fb4aa` ("Estab Life: Great Escape" — without hyphen).

The audit report still lists the duplicate because `data/audit-report.json` was generated 2026-04-14, before the deletion — and the cron has been failing since 2026-04-15 (see `CRON-DIAGNOSIS.md`), so the snapshot hasn't refreshed.

**Action:** none. Will disappear from `audit-report.json` on the next successful cron run.

## 2. *Zak Tales* missing technique — ✅ ALREADY DONE

Page `71e22b68-b3a7-4c30-8e66-c3ab8d37765b` has `Technique: ["Puppet"]` set in Notion. Same staleness mechanism as above — the 2026-04-14 audit predates the fix.

Notes from the page itself confirm: "*This is a LIVE-ACTION/PUPPETRY series, NOT animated — despite being a DIC production.*" The `Puppet` technique value is correct.

**Action:** none. Will disappear from `audit-report.json` on the next successful cron run.

## 3. Rotate `NOTION_TOKEN` — ⚠️ ONLY YOU CAN DO THIS

This is the single remaining blocker for the daily refresh. See `CRON-DIAGNOSIS.md` for the full runbook.

```bash
# 1. notion.so/my-integrations → "Animation Archive" → Configure → New token
# 2. Update GitHub secret
gh secret set NOTION_TOKEN -R kylebarrett77/animation-archive
# 3. Confirm integration is on BOTH databases:
#    - Films DB (NOTION_DATABASE_ID)
#    - Watch Links DB (e19f5cd9525446ca8e352f6b9121b3af)
# 4. Trigger
gh workflow run fetch-data.yml -R kylebarrett77/animation-archive
gh run watch -R kylebarrett77/animation-archive
```

The first successful run will:
- Pick up the Estab dedup and Zak Tales technique automatically.
- Run the new policy classifier (see `WATCH-LINK-HARDENING.md`) and rewrite ~800 watch links from `Unverified` to either `Verified` or `Restricted`.
- Drain legacy `Dead`/`Redirect` statuses to `Broken`.
- Trigger a Netlify rebuild via the data commit.
