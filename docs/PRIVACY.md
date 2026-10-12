# Privacy model

Career Agent will eventually hold resumes, employment history and email-derived signals. The MVP is built so that the default is **local, minimal and silent**.

## Defaults

* **Local storage only.** One SQLite file: `prisma/dev.db` (gitignored). No accounts, no cloud database.
* **No telemetry.** The app sends no analytics. Next.js's own anonymous telemetry is disabled by `scripts/next.mjs` (and `NEXT_TELEMETRY_DISABLED=1` in `.env.example`).
* **No outbound calls** unless you opt in (see integrations below).
* **No secrets in the repository.** `.env` is gitignored; `.env.example` contains placeholders only.
* **Synthetic fixtures only.** Demo personas and jobs are fictional (example.com addresses, 555 phone numbers, fictional companies). Tests use the same synthetic data.

## Data minimisation

* Documents store the generated text, the structured claims (with fact codes) and the gate report — not copies of the full profile.
* Email integration (future) stores only **derived signals**: message id, received time, sender domain, subject (truncated to 200 chars), detected type, company, role, confidence. Message bodies are processed in memory and discarded.
* The private profile "headline" and work-authorization note are never printed on documents.

## Your controls

* **Export:** Settings → Export JSON (or `GET /api/profiles/{id}/export`) downloads everything stored about a profile — facts, positions, education, preferences, matches/verdicts, applications with history and interviews, documents, notifications, email signals — plus the referenced jobs.
* **Import:** Settings → Import creates a new profile from an export.
* **Delete:** Settings → Delete removes a profile and, by database cascade, everything linked to it.
* **Reset demo data:** removes and re-creates only the synthetic profiles and demo jobs.

## What each integration would transmit

| Integration | Enabled by | Sends | Never sends |
|---|---|---|---|
| Template engine (default) | — | nothing | — |
| Anthropic AI rewording | `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`, and ticking "reword with …" | Per bullet: one fact's canonical text, its allowed wording, its prohibited expansions, related job-requirement labels, the target job title | Name, contact details, other facts, employer list, applications, emails |
| OpenAI-compatible AI | `AI_PROVIDER=openai` + key or local `OPENAI_BASE_URL` | Same as above (nothing leaves the machine if the base URL is localhost, e.g. Ollama) | Same as above |
| Job sources (Greenhouse/Lever/Ashby/career pages) | `JOB_SOURCES_NETWORK=on` | The board identifier or page URL in a GET request, with the app's User-Agent | Any candidate data |
| Email (Gmail/Outlook) — **not implemented** | future OAuth connection | Would use read-only scopes (`gmail.readonly` / `Mail.Read`) restricted to job-related queries; would store only derived signals | Would never send email or modify the mailbox |

AI provider data handling is governed by that provider's API terms; check retention settings before enabling it with real data.

## Before going multi-user (roadmap)

Authentication and per-user authorisation on every query and export route; encryption at rest for contact details and email signals; audit log of exports and deletions; data-retention policy (e.g. auto-delete closed-out applications after N months); a DPA with any AI provider; a published privacy policy.
