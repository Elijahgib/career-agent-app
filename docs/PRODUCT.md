# Product

**Career Agent** is a consumer AI job-search operating system.

> Find strong-fit jobs early, tailor truthfully, and manage the entire search in one place.

It is **not** a resume builder, a job board, or an auto-apply bot. It manages the lifecycle:

```
PROFILE → SEARCH → VERIFY JOB → MATCH → RANK → TAILOR → YOU APPROVE/APPLY → TRACK → INTERVIEW PREP → SKILL PLAN
```

## Who it's for

Early- and mid-career job seekers — especially career changers and people moving between adjacent roles (field tech → desktop support, retail supervisor → operations) — for whom *honest* positioning matters more than keyword stuffing, and who are hurt most by tools that inflate experience.

## What makes it different

1. **Truth Gate.** Every generated sentence cites verified evidence. Unsupported phrases block the document and are explained. Transferable experience is described as transferable — never converted into claimed experience.
2. **Provenance.** "Why can I say this?" on every line shows the exact facts behind it.
3. **Explainable matching.** Eight named score components, STRONG / GOOD / STRETCH / SKIP tiers, hard-requirement overrides, and requirements split into verified / partial / transferable / learning-only / not-verified / exposure-only / hard gap.
4. **Freshness and provenance of jobs.** Direct employer ATS feeds (Greenhouse, Lever, Ashby, schema.org career pages) before job-board alerts; first-seen / posted / last-verified dates; dedupe that keeps every source.
5. **APPLY NOW is earned.** Only shown when the posting was verified recently from a structured source and the fit is strong.
6. **Honest interview prep.** STAR stories from verified history only; scripts for admitting gaps; a "do not claim" list.
7. **Skill plan from real demand.** Recurring gaps in jobs you'd actually take, ranked by frequency × job quality × salary upside ÷ effort; certifications only when your target jobs ask for them.
8. **Local and private by default.** No accounts, no telemetry, no outbound calls unless you turn them on.

## MVP user stories (status)

| # | Story | Status |
|---|---|---|
| 1 | Create a profile | ✅ Settings → New candidate |
| 2 | Enter/import experience, education, skills, certs, preferences, salary, locations, remote, exclusions | ✅ Profile + Evidence (paste-import of resume bullets as UNVERIFIED facts) |
| 3 | Mark facts VERIFIED / UNVERIFIED | ✅ Evidence Ledger (plus positions and education) |
| 4 | Search/scan jobs | ✅ Manual paste, URL import (ATS APIs / JSON-LD), saved sources + scan (network opt-in) |
| 5 | Ranked matches | ✅ Jobs page, dashboard |
| 6 | See why each job matched | ✅ Job detail: reasons, components, per-requirement evidence |
| 7 | Hard gaps separate from transferable | ✅ Three columns on job detail |
| 8 | Reject bad-fit jobs | ✅ Skip/Reject with reason; excluded from gaps & notifications |
| 9 | Tailored resume | ✅ Gated, versioned, one-page budget for early career |
| 10 | Tailored cover letter | ✅ Gated, bridges for transferable skills, style checks |
| 11 | Know documents contain no unsupported experience | ✅ Gate report + per-claim provenance + blocked export |
| 12 | Track Saved → … → Offer / Rejected / Skip | ✅ Tracker with full status set, history, interviews, follow-ups |
| 13 | Prepare for interviews | ✅ Interview prep per job |
| 14 | Skill/cert suggestions from repeated gaps | ✅ Skill gaps page + dashboard |
| 15 | Multiple candidate profiles for friends | ✅ Profile switcher, create, export, import, delete |

## Principles

* **First-pass correctness > maximum keyword matching.**
* Never rewrite canonical facts to match a job.
* Never manufacture experience — not in resumes, letters, or interview answers.
* Never present inferred job data as verified.
* Never auto-submit. The user decides when and where to apply.
* No real applicant data in fixtures, demos or tests.
