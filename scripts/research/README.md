# Validation pipeline (Queue → Films)

Code for the Validation Protocol (🎬 Animation Archive → 📝 Validation Protocol). Each step enforces in code what Sessions 186–188 checked by hand.

```bash
# 1. Pre-check + generate research briefs (one per research agent, 5 works each)
node scripts/research/brief.mjs --next 10 --batch session189
#    → reports/research/session189/{precheck.json, brief-1.md, brief-2.md}
#    Items with an exact/similar Films duplicate are held out for review.
#    The Validated backlog is almost all US TV, so world work comes from New items:
#      node scripts/research/brief.mjs --status New --world --next 10 --batch session190
#      node scripts/research/brief.mjs --status New --country Iran --next 10 --batch session190

# 2. Research agents write draft-N.json and must pass the linter before handing back
node scripts/research/lint.mjs reports/research/session189/draft-1.json

# 3. Enter into Notion (lints again; aborts before any write on errors)
node scripts/research/promote.mjs reports/research/session189/draft-1.json --session 189 --dry
node scripts/research/promote.mjs reports/research/session189/draft-1.json --session 189

# 4. Log the session and print the checkpoint report
node scripts/research/log-session.mjs --session 189 --title "Validation — …" \
     --logs reports/research/promote-session189-*.json --calls calls.txt --blockers blockers.txt
```

## What each step guarantees

| Lesson (Sessions 186–188) | Enforced by |
|---|---|
| Drafts invented select values → stray options | brief lists live schema options; lint rejects anything else |
| Draft shape drift (titles, key casing, region as string) | lint: exact Queue title, required fields, typed watch links |
| Hand-kept entity ID map; typos | entity names resolved live; romanization/macron/name-order variants map to the existing page |
| Missed variant duplicates (Ōbari / Obari Masami) | lint flags ambiguous names; nightly data check lists variant groups |
| TMDB mis-maps or lacks IMDb IDs | Wikidata P345 checked first, TMDB second |
| Half-finished entries after a crash | all validation before writes; re-running resumes orphan pages and skips finished films |
| Duplicate Films entries | pre-check at brief time and again at entry (titles, alternates, original titles, director + year) |
| Session numbering collisions | log-session refuses an existing number |

Drafts and logs live in `reports/research/` (gitignored). Set `RESEARCH_DIR` to use another folder.

## Sources DB

Briefs list the archive's curated Sources DB entries for each work's country (with reliability), via `sourcesFor()` in `lib.mjs`.
After sessions, propose new sources from what drafts actually cited, review reliability, then add:

```bash
node scripts/research/sources-sync.mjs --sessions 190-195      # → reports/research/sources-proposal-*.md
node scripts/research/sources-sync.mjs --add reviewed.json     # [{Name, URL, Type, Reliability, "Region Focus", Language, Specialty, Notes}]
```

## Discovery (roadmap stage 4)

Find animated works from a country that are in neither Films nor the Queue (Wikidata, including predecessor states such as the People's Republic of Bulgaria), ranked by native-language Wikipedia coverage. Writes nothing without `--add`.

```bash
node scripts/research/discover.mjs --country Bulgaria                 # → reports/research/discovery/bulgaria-*.md
node scripts/research/discover.mjs --country Bulgaria --add Q1,Q2     # Queue items (Status New, Source Found "Wikidata discovery (Qid)")
```

Discovered items then go through brief → lint → promote → log like any Queue item; Wikidata fields are leads, not facts.
