# Architecture

## Stack (and why)

| Layer | Choice | Reason |
|---|---|---|
| App | **Next.js 16** (App Router, React 19, Server Components + Server Actions) | One codebase for UI and server logic; deploys to Vercel/Node later; no separate API needed for the MVP |
| Language | **TypeScript 5.9** (strict) | Shared domain types between engines, server and UI |
| Styling | **Tailwind CSS 4** + a ~10-component local kit (`src/components/ui.tsx`) | No heavy component library; easy to restyle |
| Database | **Prisma 7** + **SQLite** via the **libSQL driver adapter** | Zero-cost local dev, a single file, no native build step on Windows; Postgres-portable schema |
| Validation | Zod (server actions), TypeScript everywhere else | |
| Tests | **Vitest** (unit, property-style, DB integration) | Fast; the Truth Gate is pure TS so it's tested in isolation |
| AI | Provider interface; template (default), Anthropic SDK, OpenAI-compatible | Works with no key; AI is an optional rewording step behind the Truth Gate |

## Layout

```
career-agent-app/
├─ prisma/                    schema.prisma, migrations/, dev.db (gitignored)
├─ prisma.config.ts           Prisma 7 config (datasource URL, seed)
├─ scripts/                   seed.ts, scan.ts, next.mjs (telemetry-off launcher)
├─ src/
│  ├─ lib/                    PURE domain logic — no DB, no framework
│  │  ├─ domain/types.ts        shared types
│  │  ├─ ontology/              concepts (implies vs transfersTo) + text detection
│  │  ├─ evidence/ledger.ts     derived ROLE/EDU facts, licensing, suggestions
│  │  ├─ evidence/relations.ts  relationship semantics: lattice, cue parser, per-fact relations
│  │  ├─ truth-gate/            the gate, lexical rules, claim/violation types
│  │  ├─ jobs/                  analyze (requirements), normalize/dedupe, freshness/verification
│  │  ├─ matching/engine.ts     explainable scoring, tiers, hard-requirement overrides
│  │  ├─ documents/             resume, cover letter, render, shared helpers
│  │  ├─ interview/prep.ts      interview preparation
│  │  ├─ skills/gaps.ts         career gap / skill engine
│  │  ├─ sources/               Greenhouse, Lever, Ashby, JSON-LD adapters + safe fetcher
│  │  ├─ email/                 connector interface, classifier, mock inbox
│  │  ├─ ai/                    provider interface + implementations
│  │  └─ demo/                  SYNTHETIC personas and jobs (tests + seed)
│  ├─ server/                 Persistence + orchestration (Prisma)
│  │  ├─ db.ts, mappers.ts      client singleton, row → domain mapping
│  │  ├─ profiles, jobs, matching, documents, tracker, notifications, email, scan, seed, export
│  │  ├─ session.ts             active-profile cookie (Next-only)
│  │  └─ views.ts               shared page data loader
│  ├─ app/                    Next.js routes, server actions (actions.ts), API routes
│  └─ components/             ui.tsx (server-safe), client.tsx (small client islands)
└─ tests/                     truth-gate/, matching/, jobs/, documents/, skills/, sources/, email/, integration/
```

**Rule of thumb:** anything that decides *what is true* or *what to say* lives in `src/lib` and is unit-tested without a database. `src/server` only loads/saves and orchestrates.

## Data flow

```
Profile + positions + education + EvidenceFacts
        │  buildLedger() → stored facts + ROLE-n + EDU-n
        ▼
 CandidateSnapshot ──────────────┐
                                 │
Job (any source) → analyzeJob() ─┼─► matchJob() ─► MatchResult (tier, components, requirements, blockers)
                                 │         │
                                 │         ├─► computeSkillGaps()
                                 │         ├─► generateResume() / generateCoverLetter() / generateInterviewPrep()
                                 │         │         │ Claims with fact codes
                                 │         │         ▼
                                 │         │   validateClaims()  ← THE TRUTH GATE
                                 │         │         │ PASSED / BLOCKED + per-claim provenance
                                 ▼         ▼         ▼
                            JobMatch   Notifications  GeneratedDocument (versioned)
```

## Key engineering decisions

1. **Claims are the unit of truth.** Generators never produce free text; they produce `Claim { text, kind, section, supportingFactCodes, segments? }`. Provenance ("Why can I say this?") is therefore exact, not reconstructed.
2. **Template engine first, AI optional.** The default generator uses verified canonical text verbatim and only selects, orders and emphasises. AI may reword one fact at a time, receives only that fact and its allowed/prohibited wording, and its output is gated.
3. **Licensing ≠ transfer.** Kept as two separate relations in the ontology so "relevant to" can never become "experienced in".
3a. **Licensing ≠ relationship.** A fact that mentions a concept may be cited for it, but what can be said is capped by the relationship the fact shows (escalated, observed, used, troubleshot, administered…). A weaker relationship never authorizes a stronger claim; explicit relationships only narrow. See docs/TRUTH_GATE.md §3.
4. **Hard requirements override scores.** Blockers (clearance, license, impossible location, degree without equivalency, salary below floor, far-beyond seniority, excluded employment type/company/keyword, closed posting) force SKIP regardless of the weighted score, and the reason is shown first.
5. **Verification is field-level.** `fieldVerificationJson` per job: VERIFIED only from a structured source (ATS API) or a human "I checked it today"; parsed text is LIKELY; missing is UNKNOWN. APPLY NOW requires a recent structured verification.
6. **Dedupe by normalised company + title + location**; every sighting is a `JobSource` row, so provenance and "found directly from the employer first" survive merges.
7. **Matches are cached** in `JobMatch` and recomputed when the profile, its evidence, the job, the engine version or the day changes.
8. **Enum-like values are strings** validated in TypeScript, and list fields are JSON strings — the schema ports to Postgres without SQLite-specific features.
9. **Multi-profile without auth.** The active profile is a cookie; every query is scoped by `profileId`. `User` exists in the schema with an optional `ownerId` on profiles for the move to real accounts.
10. **No auto-apply.** There is no code path that submits an application.

## Moving to PostgreSQL / Supabase

1. In `prisma/schema.prisma` set `provider = "postgresql"` (optionally convert `*Json` string columns to `Json` and enum-like strings to Prisma enums).
2. Replace the adapter in `src/server/db.ts`: `npm i @prisma/adapter-pg pg` and `new PrismaPg({ connectionString: process.env.DATABASE_URL })`.
3. Set `DATABASE_URL` to the Postgres URL, run `npx prisma migrate dev --name postgres` to create a fresh baseline, and `npm run db:seed` if you want demo data.
4. Supabase works the same way (use the pooled connection string for the app, direct for migrations).

## Production auth (design, not built)

* Add Auth.js (or Supabase Auth / Clerk). `User` ↔ `CandidateProfile.ownerId` already exists.
* Replace `session.ts` cookie lookup with `session.user.id` → owned profiles; keep the "active profile" choice per user.
* Enforce ownership in every server action and in `/api/profiles/[id]/export` (currently local-machine trust).
* Row-level security on Postgres (Supabase RLS policies keyed on `ownerId`) as defence in depth.
* Encrypt sensitive columns (contact details, email signals) at rest with a KMS-managed key.

## Billing (design, not built)

Stripe Checkout + Customer Portal; a `Subscription` table keyed by `userId` (plan, status, current period end); gate AI rewording and live source scans by plan; the Truth Gate, tracker and template engine stay free. Webhook handler at `/api/stripe/webhook` (idempotent by event id).

## Deployment preparation

* `npm run build` produces a standard Next.js server (`npm start`).
* For hosted deployment use Postgres (SQLite files don't survive serverless instances).
* Background scans: `npm run scan` from a scheduler (Windows Task Scheduler / cron locally; Vercel Cron or a worker hitting a protected route in production).
* Required env vars are documented in `.env.example`; none are needed for local use.
