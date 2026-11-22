# Cron Diagnosis — `Fetch Notion data`

**Status (2026-11-22):** root cause confirmed; pipeline redesigned on branch
`revive/2026-11`. Waiting on one manual step (add the GitHub secret) before
the schedule is re-enabled.

## What actually happened

| Date | Event |
|---|---|
| 2026-04-14 | `fetch-data.yml` added (commit `87533fb`). The `NOTION_TOKEN` repository secret was **never created**. |
| 2026-04-15 → 06-26 | 74 scheduled runs, **0 successes**, 0 data commits. Each died in ~20 s at the first Notion call. |
| 2026-04-26 | Last push to `main`. Netlify (which fetched Notion itself, with its own token) last rebuilt the site. |
| ~2026-06-26 | GitHub auto-disabled the workflow (`disabled_inactivity`, 60 days without commits). |
| 2026-11-22 | Site still showed `UPDATED: 2026-04-26`; 561 films edited and 197 watch links added in Notion since. |

A manual dry run on 2026-11-22 kept its logs and showed the cause directly:

```
env:
  NOTION_TOKEN:          ← empty
  NOTION_DATABASE_ID:    ← empty
❌ unauthorized: Authorization header must use the format "Bearer …"
```

`gh secret list` returns nothing: the repository has no secrets at all.

> An earlier version of this file (2026-04-26) blamed **token rotation** and
> stated the cron "worked before April 15". Both were wrong: the workflow was
> created on April 14 and never succeeded once. Checking `gh secret list`
> (step 1 of its own runbook) would have shown the empty secret list.

## Why the site froze

1. The cron never worked, so it never pushed data.
2. Netlify only rebuilds on push, and nobody pushed after April 26.
3. GitHub then disabled the never-working cron for inactivity.

## Redesign (branch `revive/2026-11`)

- **GitHub Actions is the only thing that calls Notion.** It fetches,
  validates watch links, runs `npm run check:data`, smoke-builds, and commits
  `data/**` to `main` only when catalog data changed.
- **Netlify builds from the committed snapshot** (`npm run build`) and never
  calls Notion, so it no longer needs a token.
- **Safety:** related-database errors are now fatal (they used to publish an
  empty studios/directors list), and `check:data` rejects empty datasets,
  drops of more than 20%, and missing poster files.
- **Keepalive:** every run re-enables the workflow through the API so 60 quiet
  days cannot disable it again.

## Runbook — turning it on

```bash
# 1. Add the secret (paste the token from .env, or a fresh one from
#    notion.so/profile/integrations) — values are never shown back.
gh secret set NOTION_TOKEN -R kylebarrett77/animation-archive

# 2. Confirm it exists
gh secret list -R kylebarrett77/animation-archive

# 3. After revive/2026-11 is merged to main, re-enable and dry-run
gh workflow enable "Fetch Notion data" -R kylebarrett77/animation-archive
gh workflow run "Fetch Notion data" -R kylebarrett77/animation-archive -f skip_commit=true
gh run watch -R kylebarrett77/animation-archive
```

Merge the branch **before** adding the secret if the schedule is enabled:
otherwise the next run commits fresh data onto the old April code on `main`
and Netlify deploys that.
