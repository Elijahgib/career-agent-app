# Beta testing guide

Career Agent is a **local-first** app. This guide explains how to let a friend try it on
their own machine (or yours) and what feedback to collect. There is no cloud, no sign-up,
and no telemetry — each tester runs their own local copy with their own SQLite database.

---

## 1. What the beta is (and isn't)

**Is:** a working, local MVP that takes a job seeker from profile → evidence → jobs →
truthful resume/cover letter → application tracking → interview prep → skill gaps.

**Isn't (yet):** hosted/online, multi-user with accounts, real Gmail/Outlook integration,
automatic application submission, or PDF/DOCX resume import. None of these are required to
evaluate the core value.

The core value proposition to test: **does the first generated resume come out good enough
to use, and does the user trust that it won't lie on their behalf?**

---

## 2. Set a friend up (two options)

### Option A — they run it on their own machine
Requirements: **Node.js 20.19+ or 22.12+** and npm.

```bash
# copy the project folder to their machine (zip, USB, or a private git bundle), then:
cd career-agent-app
npm run setup      # install + create local SQLite DB + load synthetic demo data
npm run dev        # http://localhost:3000
```

`npm run setup` is safe to re-run. No `.env` is needed — everything works offline with the
template engine.

### Option B — they use your machine
Just run `npm run dev` and let them drive. Use the **Candidate** switcher in the top bar so
each tester gets their own profile; their data never mixes (see §4).

---

## 3. The first-run path to watch

1. On first launch (no profiles) they land on **/onboarding** — "Try the demo" vs
   "Create my profile".
2. **Try the demo** first so they see matching, the Truth Gate, a generated resume, and the
   tracker with sample data (a yellow **Demo mode** banner makes it obvious it's synthetic).
3. Then **Create my profile** and walk the guided steps: Identity → Work history →
   Education → Skills & experience → Job preferences → Truth review.
4. Add/verify a few facts, import a job (paste a URL or the description text), open the job to
   see *why* it matched, generate a resume, and click the **ⓘ "Why can I say this?"** control
   on a line.
5. Try to make it lie: edit a resume bullet to overstate (e.g. turn "escalated AD issues" into
   "Active Directory administration") and confirm it is **Blocked by Truth Gate**.

---

## 4. Multiple testers on one install (friend mode)

- Create a profile per person (top bar → **Get started**, or Settings → New candidate).
- Switch between them with the **Candidate** selector.
- Each profile's facts, jobs-in-tracker, documents, and interviews are fully isolated — this is
  covered by an automated **profile-isolation** test.
- **Export** any profile to JSON (Settings → Export JSON) as a backup, and **Import** it back as
  a new profile. Malformed files are rejected safely and never corrupt the database.
- **Delete** removes that person's data entirely (with a confirmation prompt).

Reset the sample data any time: Settings → **Reset demo data**. Demo profiles are always
synthetic and never mixed with real ones.

---

## 5. Beta feedback checklist

Ask each tester these after ~20–30 minutes. Short written answers are ideal.

**Onboarding & clarity**
- [ ] Was the onboarding understandable without someone explaining it?
- [ ] Did you understand the difference between verified, transferable, lab/study, and
      exposure-only experience?

**Matching**
- [ ] Did the match tiers (Strong / Good / Stretch / Skip) make sense for the jobs you tried?
- [ ] Did you understand **hard gaps** (a required skill with no evidence), or were they hidden
      inside a score?

**Resume / cover letter (the core test)**
- [ ] Was the **first** generated resume usable, or would you be embarrassed to send it?
- [ ] Was **any** claim in the resume inaccurate or overstated? (This is the most important
      question — quote the exact line.)
- [ ] Was anything important about you **omitted** that should have been included?
- [ ] Did you understand the **provenance** ("Why can I say this?") on each line?

**Trust & value**
- [ ] Did you trust that it wouldn't lie on your behalf?
- [ ] Would you pay for this? If so, **what would you pay** (one-time or monthly)?
- [ ] What **frustrated** you the most?
- [ ] What one change would make you recommend it to a friend?

---

## 6. What to report back to the maintainer

For any bug, capture: the page URL, what you did, what you expected, what happened, and the
browser. Since everything is local, there are no server logs to share — a screenshot and the
steps are enough. If a resume claim was wrong, **copy the exact sentence and the fact(s) it
cited** (shown in the ⓘ popover) so the Truth Gate rule can be inspected.

---

## 7. Known beta limitations to mention up front

- Resume **import is paste or .txt/.md only** — no PDF/DOCX parsing yet.
- Email is a **mock** connector; no real Gmail/Outlook.
- **No auto-apply** — the app prepares, the user always submits.
- Live job-source fetching is **off by default** (`JOB_SOURCES_NETWORK=off`); demo/manual jobs
  work with no network.
- Single-user, local, no authentication — anyone with the machine can open any local profile.
