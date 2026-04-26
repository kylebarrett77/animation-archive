# Cron Diagnosis — `Fetch Notion data`

**Status:** ❌ FAILING since 2026-04-15. 11 consecutive failed runs.
**Last successful commit:** `86a9943de9` (2026-04-14 11:49 UTC, "fix(deploy): Netlify runs fetch:all so build has Notion data").
**Site impact:** Catalog is 11 days stale. New Notion entries invisible. Watch-link verification frozen.

---

## Evidence

Pulled from `https://api.github.com/repos/kylebarrett77/animation-archive/actions/runs/24924743439/jobs` (run #11, 2026-04-25 06:32 UTC):

| Step | Status | Duration |
|---|---|---|
| Set up job | ✅ | 1 s |
| Checkout | ✅ | 1 s |
| Setup Node | ✅ | 3 s |
| Install dependencies | ✅ | 3 s |
| **Fetch films + watch-links** | **❌** | **8 s** |
| Audit snapshot | ⏭ skipped | — |
| Smoke build | ⏭ skipped | — |
| Commit refreshed data | ⏭ skipped | — |

All 11 failed runs follow the same pattern. Total elapsed time per run is ~17 seconds — consistent with auth failure on the very first Notion API call.

---

## Diagnosis

`fetch-notion.js` calls `notion.databases.query()` immediately after constructing the client. Possible failure modes ranked by likelihood:

| # | Cause | Why it fits | How to confirm |
|---|---|---|---|
| 1 | `NOTION_TOKEN` was rotated in Notion / no longer valid | 8 s fail = API call sent and rejected (`401 Unauthorized`). Pre-2026-04-15 runs worked → token died around then. | Check Notion → My Integrations → "Animation Archive" → Token tab. Compare to `gh secret list -R kylebarrett77/animation-archive`. |
| 2 | Integration was removed from one or both databases | Same auth-fail surface. | In Notion, open Films DB and Watch Links DB → ⋯ → Connections → confirm "Animation Archive" is listed. Watch Links DB ID = `e19f5cd9525446ca8e352f6b9121b3af` (per `validate-watch-links.js:27`). |
| 3 | `NOTION_DATABASE_ID` secret blank or wrong | Possible if recently edited. Would `404` not `401`. | `gh secret list -R kylebarrett77/animation-archive` (names only — values aren't readable). |
| 4 | Notion API breaking change | Would be reported broadly. Unlikely. | Check status.notion.so. |

**Primary hypothesis: token rotation.** The Notion-to-API integration tokens introduced in late 2025 have shorter rotation windows than the legacy `secret_*` format. The Apr 14 → Apr 15 cliff timing matches a 30-day token expiry if the secret was last set in mid-March.

---

## Fix — runbook

```bash
# 1. Verify which secrets exist (values not visible by design)
gh secret list -R kylebarrett77/animation-archive

# Expected: NOTION_TOKEN, NOTION_DATABASE_ID

# 2. Generate a fresh token in Notion
#    notion.so/my-integrations → Animation Archive → Configure → New token
#    Or: rotate the existing one and copy the new value.

# 3. Update the secret
gh secret set NOTION_TOKEN -R kylebarrett77/animation-archive
# Paste new token at prompt.

# 4. Verify integration is connected to BOTH databases in Notion
#    - Films DB (the one in NOTION_DATABASE_ID)
#    - Watch Links DB (e19f5cd9525446ca8e352f6b9121b3af)
#    For each: ⋯ → Connections → Add → "Animation Archive"

# 5. Trigger a manual run to confirm
gh workflow run fetch-data.yml -R kylebarrett77/animation-archive
gh run watch -R kylebarrett77/animation-archive
```

If the manual run succeeds, the daily cron will pick up automatically tomorrow morning.

---

## Hardening (so this doesn't go silent for 11 days again)

The failure was invisible because nothing alerts on cron failure. Two cheap fixes — pick one or both:

### A. Email on failure (zero infrastructure)

Add to `.github/workflows/fetch-data.yml` after the existing `commit` step:

```yaml
      - name: Notify on failure
        if: failure()
        uses: dawidd6/action-send-mail@v3
        with:
          server_address: smtp.gmail.com
          server_port: 465
          username: ${{ secrets.MAIL_USER }}
          password: ${{ secrets.MAIL_APP_PASSWORD }}
          subject: "❌ Animation Archive cron failed (${{ github.run_number }})"
          to: kylebarrett1@mac.com
          from: Animation Archive Bot
          body: |
            Run: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
            Failed step: see logs.
```

### B. Dead Man's Snitch / cronitor.io (passive monitoring)

If the cron stops *running* (not just failing), GH email won't fire. Add a `curl` ping to a dead-man's-snitch endpoint at the end of the successful path. Free tier covers daily cadence.

### C. Cheapest: just enable GitHub's built-in failure email

Settings → Notifications → "Send notifications for failed workflows only" → on. This is on by default for the repo owner but worth confirming since 11 runs failed without action.

---

## Once cron is green again

Catalog will jump from the 2026-04-14 snapshot to current Notion state — expect:
- New films added in the 11-day gap
- Updated watch-link statuses if you've been verifying manually in Notion
- Director/studio additions reflected in entity pages

Netlify auto-rebuilds on the data commit, so no separate deploy step needed.
