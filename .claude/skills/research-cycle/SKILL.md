---
name: research-cycle
description: Run one Global Animation Archive research cycle end to end (plan → brief → research agents → lint → review → promote → log → learn → sources). Use when asked to run a research session/cycle, "proceed" with validation, or when a scheduled routine starts a cycle.
---

# Research cycle (Archive Research Engine, L1)

One cycle = one Notion Session of ~10 works. Every step below is code in `scripts/research/`; run from the repo root with `node --env-file=.env …`. Design: https://claude.ai/artifact/WjHhtzvZ5ViaQJ3nKPUc2E

## Guardrails (check first, every time)
- **Pause:** if the Research Rules DB has an Active rule whose title starts with `PAUSE`, stop and report.
- Never override human curation; never hand-type select values or entity IDs; one cycle at a time.
- Session numbers are strictly sequential, and the automated data check also takes numbers. Read the next free number from `log-session.mjs --dry`.
- Escalate to the owner only what three research levels couldn't settle (internal data → Notion pages and Sessions → native-language web), each with its evidence. Display-policy questions are the owner's call.

## Steps
1. **Plan:** `plan.mjs` picks the batch (documentation gaps first, one country per brief). If a top country's Queue is nearly empty, run `discover.mjs --country X`, review the candidates, and `--add` the strongest.
2. **Brief:** run the `brief.mjs --batch session<N> "<titles>"` command that plan printed. Check the pre-check: held duplicates, entity variants, and Queue items that are season or series duplicates (mark those Duplicate rather than researching them).
3. **Research:** launch two agents in parallel, one per brief. Give each the brief path, the draft path and the lint command, plus native-language search instructions and any NEW SOURCE requests. Agents write drafts only.
4. **Lint:** agents iterate until `LINT PASSED`. Read the warnings yourself.
5. **Review:** run `review.mjs reports/research/session<N>/draft-*.json`. This freezes the agent drafts. Resolve every flag by editing the draft (by queueTitle, never by English title) or accepting it with a reason. Apply the Precedents, and run three-level research on anything they don't cover.
6. **Promote:** `promote.mjs <draft> --session N` for each draft. If it fails, fix the cause and re-run: it resumes.
7. **Queue outcomes:** mark duplicates `Duplicate` and unverifiable items `Cannot Find`, each with a note in house format.
8. **Log:** run `log-session.mjs --session N --title "…" --logs <promote logs> --calls calls.txt --blockers blockers.txt --duplicates D --cannot-find C`. It records overrides and metrics on the Sessions entry.
9. **Learn:** run `learn.mjs --write`. Read the Proposed rules it created, rewrite each as a real rule and set it Active (research method), or flag it for the owner (display policy).
10. **Sources:** run `sources-sync.mjs --sessions N-N`. Review the reliability of new hosts, then `--add reviewed.json`, including the agents' `NEW SOURCE:` lines.
11. **Report:** give the owner a short summary: films entered, corrections, rules learned, sources added, and anything truly unresolved.
