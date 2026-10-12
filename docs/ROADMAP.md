# Roadmap

## Done in v0.1 (this MVP)

P0 — isolation, skeleton, schema, profile management, Evidence Ledger, Truth Gate (+ A–J regressions), job model/import, explainable matching, core UI.
P1 — resume and cover-letter generation, per-claim provenance, tracker with history, interview prep, skill-gap recommendations.
P2 — Greenhouse / Lever / Ashby / schema.org career-page adapters, background scan framework, in-app notifications, JSON export/import/delete, multi-profile switching.
P3 — email connector interface + mock inbox + confirm-only status suggestions; auth, billing and deployment designs (docs only).
P4 (local beta pass) — guided first-run onboarding (`/onboarding`), resume import by `.txt`/`.md` upload or paste, hardened backup import (malformed files rejected before any write; rolls back on a bad row), prominent demo-mode banner, and tests for profile isolation, import rollback, and first-pass document quality. See [BETA_TESTING.md](BETA_TESTING.md).

## Next (v0.2) — make it real for a few friends

1. **Live-verify the ATS adapters** with a handful of real boards (network was blocked in the build sandbox) and add Workday / SmartRecruiters / Recruitee.
2. **Resume import** from PDF/DOCX into UNVERIFIED facts (paste and `.txt`/`.md` upload already ship) with a guided review queue (verify, edit, attach allowed/prohibited wording).
3. **DOCX/PDF export** with a clean ATS-friendly template (today: Markdown/TXT download + browser print-to-PDF).
4. **Fact editor UX**: position-level bulk verify, drag to reorder, "split this bullet into facts".
5. **LLM-assisted mention-vs-practice check** (classifier only) to flag facts that merely mention a concept.
6. **Scheduled scans** via a small worker and per-source scan frequency.

## Then (v0.3) — hosted beta

* Auth.js / Supabase Auth, ownership checks everywhere, Postgres (Supabase) with RLS.
* Encrypted columns for contact info; audit log; retention settings.
* Gmail / Outlook read-only OAuth connectors behind the existing `EmailConnector` interface.
* Notification delivery (email digest, web push) — still opt-in.
* Stripe billing: free core (Truth Gate, tracker, template engine); paid AI rewording, live scans, larger source lists.

## Later

* Salary intelligence from structured compensation fields across scanned boards.
* Company research cards (public data only) for interview prep.
* Collaborative review: share a read-only gated resume with a mentor.
* Mobile-friendly tracker views.
* Internationalisation (dates, salaries, non-US job markets).

## Explicit non-goals

* Auto-applying, mass-applying, or form-filling on the user's behalf.
* Scraping LinkedIn / Indeed or bypassing any site's terms.
* "Keyword stuffing" or ATS gaming that changes what a candidate claims.
