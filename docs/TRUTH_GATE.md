# The Truth Gate

> First-pass correctness beats maximum keyword matching.

The Truth Gate is the architectural answer to "the first resume draft overstates experience and needs a second review." Every sentence the app generates — resume bullets, summary, competencies, cover-letter sentences, interview scripts — is a **Claim** that must cite **VERIFIED** facts from the **Evidence Ledger**. If a claim contains anything the cited evidence doesn't support, the whole document is **BLOCKED** and the exact phrase is explained. Nothing is silently fixed or silently passed.

Code: `src/lib/truth-gate/` (gate, rules, types), `src/lib/evidence/ledger.ts` (licensing), `src/lib/evidence/relations.ts` (relationship semantics), `src/lib/ontology/` (concepts + detection).
Tests: `tests/truth-gate/` (regressions A–J, rule coverage, relationship semantics) and `tests/documents/generation.test.ts` (every persona × every demo job passes on the first try).

## 1. The Evidence Ledger

Each `EvidenceFact` row stores:

| Field | Purpose |
|---|---|
| `code` | Human id (`FACT-012`), unique per profile |
| `positionId` / `context` / `roleContext` | Employer / title (or school, lab, project) the fact belongs to |
| `category` | DUTY, ACHIEVEMENT, SKILL, TOOL, CERTIFICATION, LICENSE, PROJECT, LEARNING, SOFT_SKILL, CLEARANCE |
| `experienceType` | PROFESSIONAL, VOLUNTEER, ACADEMIC, PROJECT, LEARNING — drives rule J |
| `canonicalFact` | What actually happened, in plain words. **Never rewritten to fit a job.** Editing it resets verification. |
| `source`, `confidence` | Where the fact came from (self-reported, manager reference, certificate…) |
| `verificationStatus` | VERIFIED / UNVERIFIED. Only VERIFIED facts can support generated text. |
| `allowedWording` | User-approved equivalent phrasings ("hardware troubleshooting", "printer support") |
| `prohibitedExpansions` | Phrases that must never be claimed from this fact ("enterprise desktop support", "PC imaging", "SCCM") |
| `conceptIds` | Optional explicit concept tags |
| `relations` | Optional explicit relationship(s) to the subject (TROUBLESHOT, ESCALATED_TO, STUDIED…). Empty = inferred from the wording. **Can only narrow** what the wording supports, never strengthen it. |
| `startDate` / `endDate` | When relevant |

Two kinds of facts are **derived** at read time and never stored:

* `ROLE-n` — from each verified position: "Field Service Technician at Northwind Retail Systems, Austin, TX (Mar 2021 – Present)". The only thing that can license a **job title**, employer name, location or dates.
* `EDU-n` — from each verified education entry. Academic, so it never licenses professional-experience claims.

## 2. Concepts: licensing vs. transfer

`src/lib/ontology/concepts.ts` is a controlled vocabulary (~140 concepts: skills, tools, platforms, hardware, channels, environments, certifications, licenses, titles). Each concept has aliases (detected case- and hyphen-insensitively, with plurals) and two very different relationships:

* **`implies`** — licensing, stronger → weaker only. `network-engineering` implies `networking-fundamentals`. `microsoft-365` implies `microsoft-office`. The reverse is never true.
* **`transfersTo`** — *relevance only*. `hardware-troubleshooting` transfers to `desktop-support` (strength 0.55). Transfer powers match explanations and honest "is relevant to" sentences. **It never licenses a claim.**

A fact **licenses** a concept when the concept is in its `conceptIds`, detected in its canonical text, or detected in its allowed wording (unless that wording overstates the fact's relationship — §3) — then closed over `implies` — minus anything its `prohibitedExpansions` name. Licensing only says the fact may be *cited* for the concept; **what** may be said about it is limited by the relationship (§3). (A prohibition removes a concept only when the prohibited phrase *is* that concept; "Active Directory administration" does not remove plain "Active Directory".)

The Evidence page shows, for every fact, **"Lets the app say: …"** — exactly what it licenses — and one-click suggestions of common overstatements to prohibit.

## 3. Relationship semantics — FACT + RELATIONSHIP + CONTEXT + ALLOWED WORDING

Keyword presence is not evidence. "Escalated Active Directory account issues to Tier 2" *mentions* Active Directory, but the candidate's relationship to it is **ESCALATED_TO** — that must never authorize "Active Directory support". So every (fact, concept) pair carries the relation(s) the fact actually shows, and every concept mention in a claim carries the relation(s) the claim asserts. The gate requires that, for each asserted relation, some cited verified fact holds a relation that **satisfies** it. **A weaker relationship never authorizes a stronger claim.**

### Relations and the lattice

| Evidence relation | Can authorize claims of |
|---|---|
| ADMINISTERED | administered, configured, supported, troubleshot, performed + the floor |
| CONFIGURED | configured, performed + the floor |
| INSTALLED | installed, performed + the floor |
| REPAIRED | repaired, troubleshot, supported, performed + the floor |
| TROUBLESHOT | troubleshot, supported, performed + the floor |
| SUPPORTED | supported + the floor |
| PERFORMED | performed + the floor |
| USED | the floor: used, assisted, worked alongside, observed, studied |
| ASSISTED | assisted, worked alongside, observed |
| WORKED_ALONGSIDE · OBSERVED · ESCALATED_TO · STUDIED · MENTIONED_ONLY | only themselves |
| LAB_ONLY | lab only, studied |

Saying you did *less* than the evidence shows (used, observed, studied) is never an overstatement. Saying you did something *different* (escalated it, did it in a lab) needs that exact evidence.

Concepts carry an **intrinsic** relation — the activity they name: *printer troubleshooting* is TROUBLESHOT, *help desk support* SUPPORTED, *PC imaging* PERFORMED, *device deployment* INSTALLED, *Microsoft 365 administration* ADMINISTERED. Generic verbs ("performed", "provided", "handled") resolve to the concept's intrinsic relation (see below for tools, issues and record verbs).

### Reading evidence (conservative) and claims (strict)

`src/lib/evidence/relations.ts` binds relation cues (a lexicon of verbs, gerunds, nouns and phrases such as "escalated", "worked alongside the … team", "studied", "home lab", "troubleshooting", "administration") to concept mentions. **The same word means the same thing on both sides**; only the reading strategy differs.

Binding:

* **Forward** — a verb before the mention in the same clause, within 7 words, plus verbs coordinated with it ("Diagnosed **and repaired** receipt printers").
* **Backward** — relation nouns right after the mention, including coordinated ones ("Active Directory **escalations and administration**").
* **Coordination** — "routers, modems, and wireless connectivity" share the verb.
* **Generic verbs** ("performed", "handled", "provided") resolve to the concept's own activity; on a tool they mean *used*.
* "Resolved *X issues*" (or "…, including *X issues*") means supported X.
* Record verbs ("logged", "documented", "wrote", "reviewed") mean *performed* only for record-keeping concepts, otherwise *used*.
* "Maintained" means *supported*, or *performed* for record-keeping concepts.
* "Built / implemented" means installed. "Responsible for / owned / led / managed" means administered. "Responsible for *repairing*…" is the activity named, not ownership.
* British spellings read as American ones.
* A past-tense verb outside the lexicon still asserts at least *used*, so it needs hands-on evidence.
* **Instruments**: in "Automated onboarding tasks *with PowerShell*" or "Reported KPIs *using Power BI*", the verb's object is something else, so the tool is only *used*.
* **Assisting** keeps its activity. "Helped configure Outlook" needs evidence of configuring Outlook, or of assisting with that. "Assisted with Autopilot deployments" is backed by "Assisted the desktop team with deploying laptops using Autopilot". "Assisted *users* with…" is support.

**Evidence is read conservatively:**

* A weak or learning cue governs its clause ("Assisted the desktop team with *deploying* laptops" is ASSISTED). A separate main verb keeps its own relation ("Repaired printers *and* escalated outages" → printers REPAIRED).
* Someone else's action is exposure: "while senior technicians configured AD", "staff who administered AD", "laptops were imaged by IT".
* Negated actions ("Never configured…") show nothing.
* Hands-on work "in a test lab" or "in a sandbox" is LAB_ONLY.
* Writing about something ("Wrote KB articles for Wi-Fi issues", "guides on AD administration") shows *used* at most.
* A mention no verb reaches shows *used* at most. Only the head activity of a verb-less duty ("Phone support for store staff") counts as doing it. A modifier of a place or unit ("receptionist for the network engineering *department*") shows nothing.
* A verb with a pronoun object applies to what it refers to ("received failed printers and repaired *them*"). A coordinated main verb after an adverb is still the candidate's ("…, then *independently* imaged 40 laptops").
* "Supported the AD administrator" is about a person (worked alongside), not administering. A job title in an ordinary fact names a person, never a role held. Only **role facts** (from verified work history) license titles, and only their title, not words in the employer's or location's name.
* "Followed the runbook", "no escalation", "tickets escalated from Tier 1" and teaching or running a session ("Led a training session on Teams") are not exposure or study.

**Claims are read strictly:**

* Every relation word is asserted. A bare skill mention asserts the concept's own activity: "PC imaging" asserts performed, "Active Directory" asserts used, a job title asserts holding it.
* Relation words with no concept of their own attach to the concepts they refer back to: "…and resolved *them*", "Printers *repaired* on site", "Active Directory: *administration*".
* Relation words with an object of their own ("trained new hires") must be reached by a cited fact's own (capped) verbs, and that fact must be about the same object. One fact's "repaired printers" can't back "repaired the mail server" when another cited fact merely mentions mail.
* A verb governs the concepts later in its clause however far away they are ("Configured each and every one of the old store's AD accounts").
* A claim never reads the candidate's own verb as someone else's ("When needed, configured…", "I was the tech who imaged…").
* Role nouns describing the candidate assert the role ("Served as the Outlook administrator", "Escalated issues *as the domain admin*").
* A weak verb governs only what it directly introduces ("Assisted with deploying laptops using Autopilot"). A comma, "by", "after", "and" or a new finite verb starts a new assertion. Weak verbs never swallow coordinated strong ones ("Resolved and escalated…" asserts both).
* Hands-on verbs "in a home lab" are LAB_ONLY in that clause only, and never when the claim also places the work in production ("at my job", "for a client", "300 PCs"). In the Projects section, when every cited fact is lab or study work, hands-on wording describes the lab unless it names production work.
* Unicode: claims and facts are normalised (compatibility forms folded, combining and invisible characters removed) before checking, and look-alike mixed-script words are blocked.

### Allowed wording and explicit relationships

* **Allowed wording is capped by the fact.** Each phrase is parsed like a claim; if it asserts more than the fact shows (e.g. "Active Directory support" on an escalation fact), it is **ignored** and flagged on the Evidence page as *stronger than the fact*.
* **Allowed wording is checked per concept**, nested concepts included. It is compared with the relation the text shows for that concept, or the relation of the concept that implies it, or else the fact's capped ceiling. Rejected wording backs nothing anywhere in the gate (metrics, terms, prohibitions).
* **Explicit relationships only narrow.** They are never treated as evidence. A weaker explicit relation (escalated, observed, studied, mentioned only…) applies where the wording shows hands-on work or that same relation. A hands-on one applies only where the wording already reaches it — ticking "administered" on "Observed PC imaging" changes nothing, and the Evidence page says so.
* **Implied concepts inherit the relation, but never raise a concept the text describes**: "Observed PC imaging" gives *device deployment* OBSERVED, and a tag or allowed wording on Group Policy can't lift an escalated Active Directory. A held title implies its duties at their own level (Help Desk Technician → help desk support).
* **Editing** a fact's wording, category or experience type, or widening its explicit relationship, sends it back to UNVERIFIED.
* **Learning facts** are capped at STUDIED / LAB_ONLY whatever their verbs say.
* **Verbatim restatement** of a cited fact's canonical text always carries that fact's own relationship, so the template engine's verbatim bullets pass; anything added around them is still checked.

### Where it shows up

* Gate rule **`RELATION_EXCEEDS_EVIDENCE`** — names the claimed and the evidenced relation, e.g. *"“Provided Active Directory support” claims the candidate supported Active Directory, but the cited evidence only shows FACT-001: escalated (…). A weaker relationship never authorizes a stronger claim."* Strong verbs not attached to any concept ("Configured and administered store systems") need a cited fact whose own verbs reach that level.
* **Transfer hints** only offer hands-on evidence, never escalation or observation.
* **Matching** — a requirement counts as VERIFIED only when the evidence reaches what the requirement names. "Used Intune" against "MDM administration" is **PARTIAL**. A requirement the ledger only shows as exposure is **EXPOSURE_ONLY** (not verified; counts as a hard gap when required). Relevant years of experience, fact relevance, interview STAR stories and cover-letter "experience with …" wording use hands-on relations only. Skill gaps and interview prep treat exposure honestly ("Be precise about your role…", do-not-claim list).
* **Evidence page** — "Lets the app say" lists each concept with its relation (green = hands-on, purple = study/lab, amber = exposure), shows whether the relationship is inferred or set by the user, and offers relationship checkboxes when adding or editing a fact.

## 4. What the gate checks

For each evidence-bearing claim (EXPERIENCE, SKILL, SUMMARY, CREDENTIAL, EDUCATION, LEARNING):

| Rule | Blocks when |
|---|---|
| `NO_EVIDENCE` | No fact codes attached |
| `UNKNOWN_FACT` | A cited code doesn't exist |
| `UNVERIFIED_EVIDENCE` | A cited fact is not VERIFIED |
| `CONTEXT_MISMATCH` | A bullet under employer A cites a fact from employer B |
| `UNSUPPORTED_CONCEPT` | Text mentions a concept no cited verified fact licenses (with a *transferable* hint when one applies) |
| `UNSUPPORTED_TITLE` | A job title appears that no cited ROLE fact supports |
| `PROHIBITED_EXPANSION` | Text contains a phrase any ledger fact prohibits, and no cited fact legitimately supports it (works for phrases the ontology doesn't know) |
| `LEARNING_AS_EXPERIENCE` | A concept supported only by learning/lab/academic evidence appears in Experience or Competencies, with professional language ("experienced", "years of", "proficient"…), or anywhere without a learning qualifier ("studying", "home lab", "course"…) |
| `CERTIFICATION_NOT_EARNED` | A certification backed only by study is claimed as earned ("certified", "earned", "holds") or without an in-progress qualifier |
| `UNSUPPORTED_METRIC` | A number, percentage, dollar amount or vague quantity ("hundreds") not in the cited evidence; "30+" when evidence says "30" |
| `RESPONSIBILITY_INFLATION` | Leadership/ownership/outcome language (led, managed, supervised, owned, architected, senior, improved, reduced, deployed, administered…) not used by the cited evidence |
| `UNSUPPORTED_TERM` | A proper noun, acronym or product name (e.g. "Salesforce") that appears nowhere in the cited evidence — catches invented tools the ontology doesn't know |
| `RELATION_EXCEEDS_EVIDENCE` | The claim asserts a stronger relationship to a concept than any cited fact shows (escalated → "supported", observed → "imaged", studied → "experience with", used → "troubleshooting", assisted → "deployed"), or uses a strong unattached verb no cited fact reaches |

Structured claims:

* **BRIDGE** (cover letters, interview answers): `[candidate part] [approved connective] [job-reference part]`, e.g. "My hardware troubleshooting experience | is relevant to | the desktop support work in this role." The candidate part is validated like any claim; the connective must be from an approved list; the job part must refer to the role ("this role") and only mention the posting's requirements. Segments must exactly reconstruct the text (no hidden content).
* **HONEST_GAP**: must open with an admission ("I haven't …"); the gap itself may name anything; any candidate segment is validated.
* **ROLE_REFERENCE / COURTESY**: after masking the target job title and company, may contain no skills, numbers, experience assertions or unknown proper names.
* **HEADER**: name and contact details straight from the profile.

## 5. Where the gate runs

1. **Generation pre-checks.** Generators only emit phrasings that pass (e.g. competencies and summary terms are tried one by one).
2. **Whole-document validation.** Every generated document gets a `GateReport`; the document is stored with status PASSED or BLOCKED.
3. **AI output.** If an AI provider rewords a bullet, its text is validated like everything else. One unsupported phrase blocks the document, and the UI offers "Regenerate safely (template engine)".
4. **User edits.** Editing a claim in the document view creates a new version and re-runs the gate.
5. **Export.** Blocked documents cannot be downloaded (HTTP 409).
6. **Claim checker.** The Evidence page has a sandbox to test any sentence against chosen facts.

## 6. Regression suite (A–J)

`tests/truth-gate/regressions.test.ts` proves, for each known failure mode, that the overstated claim is BLOCKED with the phrase named **and** that a truthful claim from the same evidence PASSES:

| | Evidence | Blocked | Passes |
|---|---|---|---|
| A | Repaired POS systems, printers, scanners | "enterprise desktop support", "desktop administration", "endpoint management", "Experienced desktop support technician", "desktop support" (with transferable hint) | canonical text, "Hardware troubleshooting", "Troubleshoots printers and peripherals" |
| B | Installed replacement POS terminals | "Imaged and deployed…", "PC imaging and OS deployment", "Reimaged workstations with MDT" | setup wording |
| C | Used Microsoft Office | "Supported Microsoft 365 users", "Microsoft 365 administration", "Office 365 support", "Exchange Online" | Office usage |
| D | Communicated status to store managers | phone/chat/email support, "inbound calls"; also an UNVERIFIED phone-support fact | communication wording |
| E | Repaired / replaced parts | "Refurbished…", "refurbishment", "warranty claims" | repair wording |
| F | Logged parts and serials in service records | "Managed inventory", "IT asset management", "asset lifecycle management", "inventory control" | records wording, "Asset tracking" |
| G | Terminated Cat6 data cabling | "voice and data cabling", "voice cabling and 66 blocks", "Telecom cabling" | data / low-voltage cabling |
| H | Troubleshot modem/router connectivity; studying for CCNA | "Configured routers and switches", "network engineering", "Routing and switching", "network architecture", "CCNA certified" | connectivity wording; CCNA study in Projects |
| I | Supported Windows-based POS workstations | "Administered Windows…", "Windows Server administration", "Group Policy", "Active Directory" | "Windows", device-support wording |
| J | Home lab with Windows Server / AD; studying for A+ | lab as job bullet, lab skill as competency, "Experienced with Active Directory", "CompTIA A+ certified" | lab and study wording in Projects & Training / summary with "studying" |

## 7. Relationship regression suite

`tests/truth-gate/relations.test.ts` runs every case twice — relationship **inferred** from the wording and **set explicitly** — and checks each blocked claim as an experience bullet, a skills line, a summary sentence and a cover-letter sentence:

| Evidence | Must NOT authorize (all blocked) | Still passes |
|---|---|---|
| "Escalated Active Directory account issues to Tier 2." | Active Directory support, Active Directory administration, managed user accounts in Active Directory, "Experience with Active Directory", "Active Directory" as a skill, "Troubleshot/Resolved Active Directory account issues" | the escalation, restated |
| "Worked alongside the networking team." | network administration, network engineering, "Administered the network", networking experience, "Configured network switches" | the sentence itself |
| "Studied ServiceNow ticket workflows." | ServiceNow experience, administered ServiceNow, "Used ServiceNow to manage tickets", "ServiceNow" as a skill | the sentence itself |
| "Used Outlook as an email client." | Outlook troubleshooting, Microsoft 365 support, Exchange administration, Outlook administration | "Used Outlook" |
| "Observed PC imaging." | imaged computers, PC imaging, PC deployment experience, "Deployed PCs", "Reimaged laptops" | the sentence itself |
| "Escalated printer server issues." | print server administration, "Supported print servers", "Managed print queues", print server troubleshooting | the sentence itself |
| "Diagnosed and repaired receipt printers in the field." | print server administration, enterprise printer management, managed print services, "Administered printers" | printer troubleshooting, printer hardware support, peripheral troubleshooting, printer repair |
| "Troubleshot routers, modems, and wireless connectivity for customers." | network engineering, switch administration, firewall administration, "Configured routers", "Administered wireless networks" | router/modem troubleshooting, connectivity troubleshooting, wireless troubleshooting |

Plus: "worked alongside the network engineering team", "escalated issues to the help desk", overstated allowed wording, explicit MENTIONED_ONLY / ESCALATED_TO narrowing, explicit upgrades refused, ASSISTED evidence, unattached strong verbs, home-lab claims, parser and lattice unit tests, and EXPOSURE_ONLY matching.

### Adversarial suite

`tests/truth-gate/redteam.test.ts` holds every case found by two independent red-team rounds: 7 agents and about 2,000 probes in total. *Bypass* cases must be BLOCKED as an experience bullet, skills line, summary, cover-letter sentence and interview answer. *False-block* cases must raise no relationship violation. The bypass groups:

* coordinated weak and strong verbs
* follow-up verbs after a verbatim restatement ("…and resolved them myself")
* coordinated relation nouns
* acronyms
* comma-separated participles
* verb-less, third-party, passive and negated evidence
* explicit-relation, tag and implied-concept leaks
* unrelated cited facts
* stray learning words
* lab contrast
* owning and building verbs
* unknown strong verbs
* receiving escalations
* role nouns
* hidden Unicode

## 8. Known limitations (honest)

* **The relationship parser is a heuristic, English-only reader**, not a full grammar. It is tuned to be conservative on evidence and strict on claims, so its mistakes lean toward false blocks rather than false passes. A false block can be fixed by restating the fact verbatim or adding allowed wording. Unusual phrasings can still be misread; add them to `tests/truth-gate/redteam.test.ts`.
* **Strictness has a cost.** A paraphrase that attaches a verb to a different object than the fact did can be blocked. Example: "Supported staff with Active Directory password resets" from "Reset passwords … in Active Directory". The verbatim fact always passes.
* **Ambiguous verbs are mapped to one meaning.**
  * "Maintained" counts as *supported* and "replaced" counts as *performed*, so "Maintained the printer fleet" is allowed from repair evidence. Ownership needs "responsible for", "managed" or "owned".
  * "Configured" and "set up" sit on different nodes, so a configuration fact doesn't back "set up" and vice versa.
* **Instruments vs. configuration is a judgement call.** "Building forms in ServiceNow" reads as using ServiceNow, while "designing processes in ServiceNow" reads as administering it.
* **Weak verb followed by comma + participle.** In evidence, "Participated in the on-call rotation, resolving outages" stays exposure. A comma-participle after a weak verb is never credited as the candidate's own work, which can block a truthful paraphrase.
* **Vocabulary coverage.** Concepts outside the ontology are covered by the `UNSUPPORTED_TERM` (proper names) and `PROHIBITED_EXPANSION` rules, but a lowercase invented duty phrase not in the ontology and not prohibited (e.g. "handled escalations") can pass if every word is ordinary English. AI rewrites are therefore limited to one fact at a time with explicit rules, and the template engine (verbatim canonical facts) is the default.
* **Negation.** "I have not used SCCM" inside a normal EXPERIENCE claim would be blocked (the gate doesn't parse negation); honest gaps must use the structured HONEST_GAP form.
* **English only**, US-centric date/salary parsing.
