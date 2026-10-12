# Job sources

The product is **not** built around scraping LinkedIn or Indeed. Their terms prohibit scraping, their data arrives late (often days after the employer posts), and it is frequently stale. Instead, Career Agent reads jobs **directly from employers' applicant-tracking systems** through their public, documented, unauthenticated posting endpoints — the same feeds that power the employers' own career pages.

## Adapter interface

```ts
interface SourceAdapter {
  type: "GREENHOUSE" | "LEVER" | "ASHBY" | "CAREER_PAGE" | ...;
  describe(identifier): string;                         // the public endpoint
  list(identifier, fetch): Promise<NormalizedJob[]>;    // all open postings
  get(identifier, externalId, fetch): Promise<NormalizedJob | null>; // re-verify one (null = gone)
}
```

`NormalizedJob.structured` records which fields came from structured data (VERIFIED) versus parsed text (LIKELY). Adapters take an injected `fetch`, so they are unit-tested with synthetic fixtures (`tests/sources/`).

## Supported sources

| Source | Identifier | Endpoint | Structured fields |
|---|---|---|---|
| **Greenhouse** | board token (`boards.greenhouse.io/<token>`) | `GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` and `/jobs/{id}` | title, location, posting exists, apply URL, first published, requisition id, employment type (when in metadata) |
| **Lever** | company slug (`jobs.lever.co/<slug>`) | `GET https://api.lever.co/v0/postings/{slug}?mode=json` and `/{id}` | title, location, workplace type, commitment, salary range (when published), created date |
| **Ashby** | org slug (`jobs.ashbyhq.com/<org>`) | `GET https://api.ashbyhq.com/posting-api/job-board/{org}?includeCompensation=true` | title, location, remote/workplace type, employment type, compensation, published date |
| **Employer career page** | page URL | `GET <url>`, parse `<script type="application/ld+json">` `JobPosting` objects (schema.org — the markup Google for Jobs reads) | whatever the employer publishes: datePosted, employmentType, location, baseSalary, identifier |
| **Manual** | — | Paste title/company/description (+ optional URL, salary, date) | none — everything is LIKELY/UNKNOWN until verified |
| **Demo** | — | Synthetic postings at fictional companies (`src/lib/demo/jobs.ts`) | none |

Pasting a Greenhouse / Lever / Ashby link into "Import from a URL" automatically uses the structured API instead of scraping the page.

## Network policy

* **Off by default.** `JOB_SOURCES_NETWORK=off` in `.env`. Every fetch goes through `safeFetcher()`, which refuses to run unless you set `JOB_SOURCES_NETWORK=on`.
* GET only, no cookies, honest User-Agent (`JOB_FETCH_USER_AGENT`), timeout (`JOB_FETCH_TIMEOUT_MS`), size cap, http(s) only, and private-network addresses (localhost, 10.x, 192.168.x, 172.16–31.x, 169.254.x) are refused.
* **No candidate data is ever sent** to a job source — requests contain only the board identifier.
* Not verified live in the build environment: outbound access to these hosts was blocked by the sandbox's network policy, so the adapters were validated against synthetic payloads shaped like the documented responses. Verify on first live use (Settings → add a source → Run scan now) and check the scan log.

## Freshness & verification

Every job stores `postedAt` (when the source provides it), `firstSeenAt` (when *we* first saw it), `lastSeenAt`, `lastVerifiedAt`, `status` (ACTIVE / CLOSED) and per-field verification (`VERIFIED` / `LIKELY` / `UNKNOWN`).

* **Scan** (`npm run scan` or Settings → Run scan now): for each saved source, upsert postings, mark postings that disappeared as CLOSED (and move SAVED/READY applications to EMPLOYER_CLOSED), notify when a closed posting reappears, then re-score every profile.
* **Re-check source** on a job re-fetches that single posting; a 404 marks it CLOSED.
* **"I checked it today"** records a human verification for manual jobs.
* **APPLY NOW** requires: ACTIVE, verified in the last 72 hours from a structured source or by you, ≤ 21 days old, an application URL, and a STRONG or GOOD tier.

## Dedupe & provenance

Jobs are keyed by normalised company + title + location (`dedupeKey`). A posting seen from several sources becomes one job with several `JobSource` rows (type, name, external id, URL, first/last seen). The job page shows every source and, when an employer feed saw it first, a note like *"Found directly from the employer's greenhouse feed 3 days before manual."*

## Adding a source

1. Implement `SourceAdapter` in `src/lib/sources/<name>.ts` (normalise to `NormalizedJob`, mark structured fields honestly).
2. Register it in `ADAPTERS` (`src/lib/sources/index.ts`) and, if it has recognisable URLs, in `detectSourceFromUrl`.
3. Add fixture-based tests in `tests/sources/`.

Candidates for next: Workday (CXS JSON endpoints per tenant), SmartRecruiters public postings API, Recruitee, Workable, USAJOBS (official API, key required), state job banks.
