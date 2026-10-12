# Build report — Career Agent MVP (session of 2026-10-04)

## 1. Project location

* Built in a **cloud session**, not on the Windows laptop. The session could only reach the GitHub repository `Elijahgib/tempo`, so the project was created as the self-contained folder **`career-agent-app/`** on branch **`claude/career-agent-app-mvp-zgujh2`**. No Tempo file was modified (verified: `git diff main -- . ':(exclude)career-agent-app'` is empty).
* Target path: `C:\Users\ELaptop800\Projects\career-agent-app`. The README section "Getting this folder as its own repository" extracts the folder into a standalone repo containing only this project's history (`git subtree split`). That procedure was rehearsed here: the result is a 5-commit repo with the project at its root, and a cold `npm run setup` plus `npm test` in it passed.
* A creation note: an orphan branch (a completely separate history) was attempted first, but it would have deleted the Tempo files from the working tree, and the session's safety policy refused it. The subfolder + subtree-split approach gives the same end result without touching Tempo.

## 2–3. career-ops isolation

* `C:\Users\ELaptop800\Projects\career-ops` is on the Windows machine. This cloud container has no access to it, and GitHub access was scoped to `Elijahgib/tempo` only (no `career-ops` repo is visible to the account).
* **career-ops was therefore neither read nor modified.** Its git status could not be recorded from here. Run `git -C C:\Users\ELaptop800\Projects\career-ops status` at home to confirm it matches what you expect.
* No personal data from career-ops (or anywhere else) is in this project. All fixtures are synthetic.

## 4. Features completed

* Evidence Ledger with VERIFIED/UNVERIFIED facts, allowed wording, prohibited expansions, sources, confidence, derived ROLE/EDU facts, "Lets the app say" preview, overstatement suggestions, and paste-import of resume bullets as unverified facts.
* **Truth Gate** (12 evidence rules + structured bridge / honest-gap / role-reference checks), applied to generation, AI output, user edits and export.
* Profile management: basics, work history, education, preferences (titles, keywords, salary target + hard floor, remote, locations, relocation, employment types and exclusions, clearance, license, travel, excluded companies and keywords).
* Multiple local candidate profiles: switcher, create, export JSON, import, delete (cascade), plus 3 synthetic demo personas and 17 synthetic demo jobs.
* Job import: manual paste; URL import (Greenhouse, Lever and Ashby APIs, and schema.org career pages); saved sources; background scan with open/close detection.
* Job analysis: required/preferred/responsibility items, OR-groups, years, degree + equivalency, clearance (active vs. obtainable), licenses, salary, remote, seniority, travel, and uninterpreted lines (shown as UNKNOWN, never guessed).
* Matching: 8 named components, STRONG/GOOD/STRETCH/SKIP, hard-requirement overrides, verified-coverage caps, and requirements classified as verified / partial / transferable / learning-only / not verified / exposure-only / hard gap.
* Freshness (posted / first seen / last seen / last verified), per-field VERIFIED/LIKELY/UNKNOWN, APPLY NOW gating, dedupe with source provenance and "found first" notes.
* Tailored resume (one-page budget for early career), cover letter (transferable bridges, hype/verbatim checks), versioning, "Why can I say this?" provenance popovers, edit & re-check, blocked export, Markdown/TXT download, print-to-PDF styling.
* Tracker with all 11 statuses, history/audit log, interviews, follow-ups, notes, outcome, and links to the resume/cover-letter versions used.
* Interview prep: likely questions, technical questions, STAR stories from verified facts, honest-gap scripts, do-not-claim list, and questions to ask.
* Skill-gap engine: frequency × quality × salary upside ÷ effort, quick wins (verify existing facts), certifications only when the jobs you'd take ask for them, and an honest "can't study for this" list.
* In-app notifications: strong fresh match, follow-up, interview reminder, status email detected, job re-activated.
* Email connector interface, local classifier, mock inbox, and confirm-only status suggestions.
* AI provider abstraction: template (default, offline), Anthropic (official SDK, `claude-opus-5-5`, low effort, server-side refusal fallback), and OpenAI-compatible (including local Ollama).
* Privacy: no telemetry (Next.js telemetry disabled via the launcher), network opt-in, safe fetcher, no secrets in the repo.

## 5. Partially completed

* ATS adapters: implemented and unit-tested against synthetic payloads. **Not verified live**, because the sandbox's network policy blocked Greenhouse, Lever and Ashby.
* Document export: Markdown/TXT plus browser print-to-PDF. No DOCX or PDF file generation.
* Resume import: paste text only (no PDF/DOCX parsing).
* Email: mock connector only; Gmail and Outlook are interface-level.
* Auth, billing and deployment: designs in `docs/ARCHITECTURE.md`, not implemented.

## 6. Not started

Real OAuth email connectors, user accounts/auth, billing, hosted deployment, Workday/SmartRecruiters adapters, notification delivery outside the app, i18n.

## 7. Truth Gate implementation

`src/lib/truth-gate/gate.ts` validates `Claim`s against the ledger. Facts license concepts (explicit tags + concepts detected in canonical text and allowed wording, closed over `implies`, minus prohibitions); `transfersTo` never licenses anything. Rules: NO_EVIDENCE, UNKNOWN_FACT, UNVERIFIED_EVIDENCE, CONTEXT_MISMATCH, UNSUPPORTED_CONCEPT (with a transferable hint), UNSUPPORTED_TITLE, PROHIBITED_EXPANSION, LEARNING_AS_EXPERIENCE, CERTIFICATION_NOT_EARNED, UNSUPPORTED_METRIC, RESPONSIBILITY_INFLATION, UNSUPPORTED_TERM, plus checks on structured bridges and honest gaps. Full write-up: `docs/TRUTH_GATE.md`.

## 8. Truth Gate regression results

`npm run test:truth-gate` → **46/46 passed** (28 regression tests covering A–J, both blocked and truthful variants, plus 18 rule tests). In addition, **51/51** persona × job combinations generate a resume, cover letter and interview prep that pass the gate on the first try. AI-overstatement, AI-failure and user-edit cases are also covered.

## 9. Job sources

Manual paste · Greenhouse · Lever · Ashby · employer career pages (schema.org JobPosting) · synthetic demo feed. Outbound fetching is off until `JOB_SOURCES_NETWORK=on`.

## 10–12. Status

* Resume / cover letter: complete (template engine). AI rewording is optional and gated.
* Tracker: complete (statuses, history, interviews, follow-ups, email suggestions).
* Interview prep: complete (generated on demand per job; scripts are gated).

## 13–14. Quality

* `npm test` → **170 passed, 0 failed** (10 files, including a real-SQLite integration suite).
* `npm run lint` → clean. `npm run typecheck` → clean.
* `npm run build` → success (Next.js 16.3.8, Turbopack).
* Browser e2e (Playwright, not part of the repo): generate → provenance → overstated edit blocked → blocked export refused (409) → cover letter → claim checker → tracker → inbox → interview prep → skills → scan → export. A crawl of 182 pages across 3 profiles found 0 errors.

## 15. Command to run at home

From a standalone copy (see the README) or the `career-agent-app` folder:

```powershell
npm run setup
npm run dev
```

## 16. Local URL

http://localhost:3000

## 17. Credentials that would improve it (all optional)

* `ANTHROPIC_API_KEY` — optional AI rewording of bullets (always gated). Alternatively a local Ollama with `AI_PROVIDER=openai`.
* No key is needed for Greenhouse, Lever, Ashby or career pages; just set `JOB_SOURCES_NETWORK=on` and add the boards you care about.
* Future: Google/Microsoft OAuth app credentials for read-only email detection; USAJOBS API key if federal jobs matter.

## 18. Top 5 next steps

1. Turn on `JOB_SOURCES_NETWORK`, add 5–10 real target employers' boards, and confirm the adapters against live data.
2. Enter your own profile, paste old resume bullets, and verify facts one by one. Add prohibited expansions where past drafts overstated.
3. PDF/DOCX resume import and DOCX/PDF export.
4. Have 2–3 friends try it on their own profiles; collect false-block and false-pass cases into `tests/truth-gate`.
5. Auth + Postgres when ready to host; then Gmail read-only detection.

---

# Update — relationship semantics in the Truth Gate (same day, second phase)

No product features were added in this phase. It covered only the two requested priorities: preserving the project and strengthening the Truth Gate.

## Priority 1 — preserving the project

* The project still lives only in `career-agent-app/` on branch `claude/career-agent-app-mvp-zgujh2`. No Tempo file was modified (`git diff main -- . ':(exclude)career-agent-app'` is empty). Nothing was pushed: the session's GitHub App cannot write to `Elijahgib/tempo`, and Tempo must not be the permanent home anyway.
* Creating `Elijahgib/career-agent-app` from this session returned 403 ("Resource not accessible by integration"). Create the empty repository yourself and grant the Claude GitHub App access; a later session can then push the `standalone` branch as `main`.
* The standalone history is delivered as git bundles (each one verified by cloning it). The first bundle is kept unchanged; the updated one has a new filename. See the end-of-session report for exact paths.

## Priority 2 — relationship semantics

Keyword presence is no longer evidence. Every (fact, concept) pair carries the relation(s) the fact shows: administered, configured, installed, repaired, troubleshot, supported, performed, used, assisted, worked alongside, observed, escalated, studied, lab only or mentioned only. Every concept mention in a claim carries the relation(s) it asserts. **A weaker relationship never authorizes a stronger claim.** The validator reasons from FACT + RELATIONSHIP + CONTEXT + ALLOWED WORDING. Full design: `docs/TRUTH_GATE.md` §3.

* New gate rule `RELATION_EXCEEDS_EVIDENCE`, applied to every evidence-bearing claim: resume, cover letter, interview scripts, user edits, AI rewrites and the claim checker.
* Explicit, user-confirmed relationships per fact (`EvidenceFact.relationsJson`, migration `20261004203418_evidence_relations`). They can only narrow what the wording shows.
* The Evidence page shows each concept's relationship, flags allowed wording that claims more than the fact, and offers relationship checkboxes.
* Matching gained `EXPOSURE_ONLY` and `PARTIAL` requirement statuses. Relevant years, fact relevance, interview STAR evidence and cover-letter wording use hands-on relations only.

### How it was hardened

1. All requested must-fail and reverse cases were written as tests. Each runs with the relationship inferred and set explicitly, across experience, skills, summary and cover-letter placements.
2. **Red-team round 1** (4 independent agents: bypass hunting, false-block hunting, parser edge cases, code review; ~1,400 probes) found 77 issues. The reader was redesigned rather than patched.
3. **Red-team round 2** (3 agents, ~1,000 probes) against the redesign found 55 further issues, all triaged and fixed or documented as limitations.
4. Every reproduced red-team case is a permanent regression in `tests/truth-gate/redteam.test.ts`.

### Results

* `npm test`: **835 passed, 0 failed** across 12 files (170 before this phase).
  * `tests/truth-gate/relations.test.ts`: 183
  * `tests/truth-gate/redteam.test.ts`: 482
  * `tests/truth-gate/regressions.test.ts`: 28 (unchanged, all passing)
  * `tests/truth-gate/rules.test.ts`: 18
  * `tests/documents/generation.test.ts`: 65, including **all 51 persona × job resume / cover letter / interview-prep combinations passing the gate on first generation**
  * plus matching, sources, email, skills, jobs and integration suites
* `npm run lint`, `npm run typecheck` and `npm run build` are clean.
* Live check against a production build: 176 pages crawled across 3 profiles with 0 errors, and every interview prep passed the gate. Adding "Escalated Active Directory account issues to Tier 2." through the Evidence form shows each concept as *escalated*. The claim checker blocks "Provided Active Directory support" with `RELATION_EXCEEDS_EVIDENCE` and passes the escalation restated.

### Honest limits

The relationship reader is a conservative English heuristic, not a full grammar. It leans toward blocking. Known false-block patterns and judgement calls are listed in `docs/TRUTH_GATE.md` §8. The verbatim fact always passes.

---

# Local beta-finishing pass (session of 2026-10-05, Windows laptop)

This session ran on the user's Windows laptop against the standalone repo at
`C:\Users\ELaptop800\Projects\career-agent-app` (branch `main`). career-ops and
Tempo/tempo-teleport were left untouched (read-only `git status` only).

## Fixed
* Windows integration-test flakiness: async (non-blocking) `prisma migrate deploy`
  and `fs.rm` in test setup/teardown, WAL/SHM cleanup, and `testTimeout` raised to
  20s. Full suite now green on Windows (was 834/835 → now 835+/… green).

## Added / improved (beta pass)
* **Onboarding** (`/onboarding`): guided first-run — Try Demo vs Create My Profile,
  then a progress-aware setup (identity → work → education → skills tiers →
  preferences → truth review). First launch and NoProfile route here.
* **Resume import**: `.txt`/`.md` file upload in addition to paste; everything stays
  UNVERIFIED.
* **Backup import hardening**: `validateImport()` rejects malformed/foreign files
  before any write; `importProfile()` rolls back the new profile if any row fails.
  The action shows a readable error instead of a stack trace.
* **Demo-mode banner**: shown on every page when the active candidate is synthetic.

## Tests (deterministic, no product behavior changed)
* `tests/export/validate.test.ts` — malformed-import validation.
* `tests/integration/services.test.ts` — profile isolation + import rollback.
* `tests/documents/generation.test.ts` — first-pass quality across every demo
  persona × job (no duplicate bullets, one-page target, no JD copy, short letter).

## Dependency security
* 11 npm-audit advisories reviewed. All are **dev/build-time only** (`vitest`,
  `eslint-config-next`, the `prisma` CLI → unused `mysql2`); the production
  `dependencies` have **zero** advisories. Every offered fix is a breaking major
  change, and `npm audit fix` (non-breaking) is a no-op. No forced fix applied —
  documented per policy.

## Verification
lint ✓ · typecheck ✓ · tests ✓ (13 files / 893) · production build ✓ ·
browser smoke test ✓ (all routes 200, demo banner present) · Truth Gate ✓.
