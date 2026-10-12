# Career Agent

**A consumer AI job-search operating system — find strong-fit jobs early, tailor truthfully, and manage the entire search in one place.**

```
PROFILE → SEARCH → VERIFY JOB → MATCH → RANK → TAILOR → YOU APPROVE/APPLY → TRACK → INTERVIEW PREP → SKILL PLAN
```

Career Agent is not a resume builder, a job board or an auto-apply bot. It keeps a structured **Evidence Ledger** of what you have actually done, matches jobs against it with an explainable score, and generates tailored resumes, cover letters and interview prep in which **every sentence must cite verified evidence**. Anything unsupported is **Blocked by Truth Gate**, and the app explains the exact phrase.

> **No auto-apply.** The app prepares; you decide when and where to submit.

---

## Why it's different

* **Truth Gate** — first-pass correctness over keyword matching. Overstatements such as "field repair → enterprise desktop administration", "used Office → Microsoft 365 admin" or "home lab → professional experience" are blocked by design and covered by regression tests.
* **Relationship semantics** — keyword presence is not evidence. Every fact records *how* you relate to each subject (administered, configured, installed, repaired, troubleshot, supported, performed, used, assisted, worked alongside, observed, escalated, studied, lab only, mentioned only), and a weaker relationship never authorizes a stronger claim: "Escalated Active Directory issues to Tier 2" can never become "Active Directory support". See [docs/TRUTH_GATE.md](docs/TRUTH_GATE.md#3-relationship-semantics--fact--relationship--context--allowed-wording).
* **Provenance** — "Why can I say this?" on every generated line shows the facts behind it.
* **Explainable matching** — eight named score components, STRONG / GOOD / STRETCH / SKIP, hard-requirement overrides (clearance, license, location, degree, salary floor, seniority, employment type), and requirements split into **verified / partial / transferable / learning-only / not verified / exposure-only / hard gap**.
* **Fresh jobs from the source** — Greenhouse, Lever and Ashby public feeds and schema.org employer career pages, with first-seen / posted / last-verified dates, dedupe that keeps every source, and "APPLY NOW" only after recent verification.
* **Honest interview prep and a skill plan built from real demand.**
* **Local and private by default** — SQLite file, no accounts, no telemetry, no outbound calls unless you enable them.

## Quick start (Windows, macOS or Linux)

Requirements: **Node.js 20.19+ or 22.12+** (Node 22 LTS recommended) and npm.

```bash
cd career-agent-app
npm run setup      # install, generate Prisma client, create the SQLite DB, load synthetic demo data
npm run dev        # http://localhost:3000
```

`npm run setup` is safe to re-run. A `.env` file is optional — defaults work with no keys. To customise, copy the template first:

```bash
copy .env.example .env      # Windows (PowerShell/cmd)
cp .env.example .env        # macOS/Linux
```

Open **http://localhost:3000**. On first run you land on a guided **onboarding** flow — try the demo, or create your own profile step by step (identity → work history → education → skills → job preferences → truth review). Use the **Candidate** picker in the top bar to switch between profiles. Letting a friend test it? See [docs/BETA_TESTING.md](docs/BETA_TESTING.md).

### First tour (5 minutes)

1. **Dashboard** — strongest fresh matches, pipeline, interviews, follow-ups, recurring gaps.
2. **Evidence Ledger** — verified vs unverified facts, allowed wording, prohibited expansions. Try the **Truth Gate claim checker**: type "Managed inventory for 30 stores", cite FACT-004, and run it.
3. **Jobs → Desktop Support Technician (Contoso Health demo)** — see why it is STRETCH: verified matches, *transferable* desktop support, hard gaps.
4. **Generate resume** → open "Why can I say this?" on any line → edit a bullet to say "enterprise desktop support" → **Blocked by Truth Gate**.
5. **Interview prep** for the same job — honest gap scripts and a do-not-claim list.
6. **Tracker** → **Scan mock inbox** → confirm a suggested status change.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server (Next.js telemetry disabled) |
| `npm run build` / `npm start` | Production build / server |
| `npm test` | All tests (Vitest) |
| `npm run test:truth-gate` | Truth Gate suites only |
| `npm run lint` | ESLint (Next.js config) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run check` | lint + typecheck + test + build |
| `npm run db:deploy` | Apply migrations to the database |
| `npm run db:migrate` | Create a new migration after editing the schema |
| `npm run db:seed` | Load synthetic demo data (`-- --reset` to reload) |
| `npm run db:reset` | Drop and recreate the database (then seeds) |
| `npm run scan` | Background scan of saved job sources (for Task Scheduler / cron) |

## Architecture

Next.js 16 (App Router, Server Components, Server Actions) · TypeScript · Tailwind CSS 4 · Prisma 7 with SQLite through the libSQL driver adapter · Vitest.

All decision logic — ontology, ledger licensing, Truth Gate, job analysis, matching, document generation, interview prep, skill gaps — is pure TypeScript in `src/lib` and is unit-tested without a database. `src/server` handles persistence and orchestration; `src/app` is the UI. Details, data flow and design decisions: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Database

* Local SQLite file at `prisma/dev.db` (gitignored), set by `DATABASE_URL="file:./prisma/dev.db"`.
* Schema: `prisma/schema.prisma`; migrations: `prisma/migrations/`; Prisma 7 config: `prisma.config.ts`.
* The schema avoids SQLite-only features (enum-like strings, JSON-encoded lists) so it ports to PostgreSQL/Supabase — steps in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#moving-to-postgresql--supabase).

## Environment variables

See [.env.example](.env.example). Everything is optional.

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `file:./prisma/dev.db` | Database location |
| `AI_PROVIDER` | `template` | `template` (offline), `anthropic`, or `openai` (any OpenAI-compatible endpoint, incl. local Ollama/LM Studio) |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | — / `claude-opus-5-5` | Anthropic provider |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` | — / `https://api.openai.com/v1` / `gpt-4o-mini` | OpenAI-compatible provider |
| `JOB_SOURCES_NETWORK` | `off` | `on` allows outbound fetches to public ATS feeds and career pages |
| `JOB_FETCH_TIMEOUT_MS`, `JOB_FETCH_USER_AGENT` | 10000, app UA | Fetch behaviour |
| `EMAIL_CONNECTOR` | `mock` | Only `mock` exists in v0.1 |
| `NEXT_TELEMETRY_DISABLED` | `1` | Belt-and-braces; the launcher already disables it |

## AI provider configuration

The **template engine is the default** and needs nothing: it uses your verified canonical facts verbatim and only selects, orders and emphasises them.

Optional AI rewording of individual bullets:

```env
AI_PROVIDER="anthropic"
ANTHROPIC_API_KEY="sk-ant-..."
ANTHROPIC_MODEL="claude-opus-5-5"
```

or a local model with no data leaving your machine:

```env
AI_PROVIDER="openai"
OPENAI_BASE_URL="http://localhost:11434/v1"   # Ollama
OPENAI_MODEL="llama3.1"
```

Then tick **"reword with …"** next to *Generate resume*. The provider receives one fact at a time (plus its allowed/prohibited wording) — never your contact details or full profile — and **its output goes through the Truth Gate**. If it invents anything, the document is blocked and the phrase is shown; "Regenerate safely" falls back to the template engine.

## Job sources

| Source | How |
|---|---|
| Manual paste | Jobs → Add a job manually |
| Greenhouse / Lever / Ashby | Paste a job or board link in Jobs → Import from a URL, or add the board in Settings → Job sources |
| Employer career pages | Any page publishing schema.org `JobPosting` JSON-LD |
| Demo | Synthetic postings at fictional companies |

Outbound fetching is **off** until you set `JOB_SOURCES_NETWORK=on`. LinkedIn and Indeed are deliberately not scraped. Details: [docs/JOB_SOURCES.md](docs/JOB_SOURCES.md).

## Privacy model

Local SQLite, no accounts, no telemetry, nothing sent anywhere unless you configure an AI provider or enable job-source fetching. Export or delete any profile from Settings. Demo and test data are synthetic. What each integration would transmit: [docs/PRIVACY.md](docs/PRIVACY.md).

## Testing

```bash
npm test                 # 13 files, 842 tests
npm run test:truth-gate  # Truth Gate regressions A–J, rule coverage, relationship semantics
```

| Suite | Covers |
|---|---|
| `tests/truth-gate/regressions.test.ts` | The ten known overstatement failure modes (A–J), blocked and truthful variants |
| `tests/truth-gate/rules.test.ts` | Evidence, metrics, inflation, invented tools, prohibited phrases, bridges, honest gaps, role references |
| `tests/truth-gate/relations.test.ts` | Relationship semantics: escalated / worked alongside / studied / used / observed evidence never authorizes stronger claims; hands-on evidence authorizes what it shows and no more; inferred and explicit relationships; allowed-wording caps; parser and lattice units; EXPOSURE_ONLY / PARTIAL matching; robustness |
| `tests/truth-gate/redteam.test.ts` | Every bypass and false block found by two independent red-team rounds, kept as regressions (bypasses blocked in every placement; faithful restatements never blocked by the relationship rule) |
| `tests/documents/generation.test.ts` | **Every synthetic persona × every demo job**: resume, cover letter and interview prep pass the gate first time; AI overstatement is blocked; unverified facts are excluded |
| `tests/matching/*` | Requirement extraction, tiers, hard-requirement overrides, verified vs transferable vs learning-only vs not-verified |
| `tests/jobs/*`, `tests/sources/*` | Freshness, APPLY NOW gating, dedupe, provenance, ATS adapters (synthetic payloads), safe fetcher |
| `tests/skills/*`, `tests/email/*` | Gap prioritisation, email classification, confirm-only suggestions |
| `tests/integration/services.test.ts` | Real Prisma + SQLite: seed, scoring, versioned documents, blocked edits, tracker history, email confirmations, scan open/close, export → import → delete, **profile isolation** (no cross-profile leakage), **import rollback** (malformed file never corrupts the DB) |
| `tests/export/validate.test.ts` | Backup-import validation: malformed/foreign files are rejected with a clear message before any write |

## Known limitations

* The Truth Gate's relationship reader is a conservative English heuristic, not a full grammar: unusual phrasings can be misread (it leans toward blocking). See [docs/TRUTH_GATE.md](docs/TRUTH_GATE.md#8-known-limitations-honest).
* ATS adapters were validated against synthetic payloads — the build sandbox blocked outbound access to Greenhouse/Lever/Ashby. Verify on first live use.
* Exports are Markdown/TXT; use the browser's Print → Save as PDF for PDF. No DOCX yet.
* Resume import accepts pasted text or a `.txt`/`.md` file upload (bullets become unverified facts); no PDF/DOCX parsing yet.
* Email is a mock connector; Gmail/Outlook are interface-only.
* Single-user local app: no auth; anyone with access to the machine can open any local profile.
* English / US-centric parsing of salaries, dates and locations.

## Production roadmap

Auth + Postgres (Supabase) with row-level security → live-verified ATS adapters and scheduled scans → PDF/DOCX resume import and export → Gmail/Outlook read-only connectors → billing. Full list: [docs/ROADMAP.md](docs/ROADMAP.md). Product overview: [docs/PRODUCT.md](docs/PRODUCT.md). What was built in the first session and how it was verified: [docs/BUILD_REPORT.md](docs/BUILD_REPORT.md).

## Getting this folder as its own repository

This project was built in a cloud session as the self-contained folder `career-agent-app/` on branch `claude/career-agent-app-mvp-zgujh2` of the `Elijahgib/tempo` repository (it shares no files with the Tempo app). To turn it into a standalone repository at `C:\Users\ELaptop800\Projects\career-agent-app` with only this project's history:

```powershell
cd C:\Users\ELaptop800\Projects
git clone --branch claude/career-agent-app-mvp-zgujh2 --single-branch https://github.com/Elijahgib/tempo.git career-agent-app-import
cd career-agent-app-import
git subtree split --prefix=career-agent-app -b standalone
cd ..
git clone --branch standalone .\career-agent-app-import career-agent-app
cd career-agent-app
git branch -m standalone main
git remote remove origin
npm run setup
npm run dev
```

(If you received `career-agent-app.bundle` instead: `git clone --branch standalone career-agent-app.bundle career-agent-app`, then `cd career-agent-app`, `git branch -m standalone main`, `git remote remove origin`, `npm run setup`, `npm run dev`.)
