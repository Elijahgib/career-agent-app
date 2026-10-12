// Cover letters connect only verified experience to the role, describe
// transferable skills as transferable, and avoid hype. The Truth Gate applies.

import type { CandidateSnapshot, JobRecord, LedgerFact } from "@/lib/domain/types";
import { experienceConcepts, isProfessional, licenseForFact } from "@/lib/evidence/ledger";
import { isExperienceWording } from "@/lib/evidence/relations";
import { analyzeJob } from "@/lib/jobs/analyze";
import { factRelevance, matchJob } from "@/lib/matching/engine";
import { conceptLabel } from "@/lib/ontology/concepts";
import { validateClaims, type GateContext } from "@/lib/truth-gate/gate";
import { ClaimBuilder, article, conceptPhrase, lcFirst, rankedFacts, roleFactFor, stripPeriod, supportable, verifiedFacts, verifiedPositions } from "./common";
import { DOCUMENT_ENGINE_VERSION, type GeneratedDocument } from "./types";

const HYPE = ["thrilled", "passionate", "dream job", "rockstar", "ninja", "guru", "perfect fit", "beyond excited", "incredibly excited", "world-class", "unparalleled", "synergy"];

export function styleCheck(text: string, resumeBullets: string[] = []): string[] {
  const out: string[] = [];
  for (const h of HYPE) if (new RegExp(`\\b${h}\\b`, "i").test(text)) out.push(`Avoid hype: “${h}”.`);
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words > 380) out.push(`Letter is ${words} words — aim for under 350.`);
  const verbatim = resumeBullets.filter((bl) => bl.length > 30 && text.toLowerCase().includes(bl.toLowerCase()));
  if (verbatim.length > 1) out.push(`${verbatim.length} resume bullets are repeated word-for-word; vary the wording.`);
  return out;
}

function firstPerson(f: LedgerFact): string {
  return `I ${lcFirst(stripPeriod(f.canonicalFact))}.`;
}

export function generateCoverLetter(s: CandidateSnapshot, job: JobRecord, opts: { now?: Date; resumeBullets?: string[] } = {}): GeneratedDocument {
  const now = opts.now ?? new Date();
  const analysis = analyzeJob(job);
  const match = matchJob(s, job, { analysis, now });
  const ctx: GateContext = { facts: s.facts, job: { title: job.title, company: job.company, requirementConceptIds: analysis.requirements.map((r) => r.conceptId) } };
  const b = new ClaimBuilder();
  const name = s.profile.displayName.replace(/\s*\(demo\)\s*$/i, "");
  const facts = verifiedFacts(s);

  const header = [
    b.add({ section: "header", kind: "HEADER", text: name, supportingFactCodes: [] }),
    b.add({ section: "header", kind: "HEADER", text: [s.profile.email, s.profile.phone].filter(Boolean).join(" · "), supportingFactCodes: [] }),
    b.add({ section: "header", kind: "HEADER", text: now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }), supportingFactCodes: [] }),
  ];
  const greeting = b.add({ section: "letter", kind: "COURTESY", text: `Dear ${job.company} hiring team,`, supportingFactCodes: [] });
  const opening = b.add({ section: "letter", kind: "ROLE_REFERENCE", text: `I am applying for the ${job.title} position at ${job.company}.`, supportingFactCodes: [] });

  // ── Paragraph 2: the most relevant verified professional work ──
  const body: string[] = [];
  const prof = rankedFacts(facts.filter((f) => !f.derived && isProfessional(f) && f.positionId), analysis).filter((f) => factRelevance(f, analysis) > 0);
  const positions = verifiedPositions(s);
  const top = prof.slice(0, 1);
  if (top[0]) {
    const pos = positions.find((p) => p.id === top[0].positionId);
    const role = pos ? roleFactFor(s, pos.id) : undefined;
    if (pos && role) {
      const lead = pos.endDate ? `As ${article(pos.title)} ${pos.title} at ${pos.employer}, ` : `In my current role as ${article(pos.title)} ${pos.title} at ${pos.employer}, `;
      const text = `${lead}${firstPerson(top[0])}`;
      if (supportable(ctx, text, [role.code, top[0].code], "letter", "EXPERIENCE")) {
        body.push(b.add({ section: "letter", kind: "EXPERIENCE", text, supportingFactCodes: [role.code, top[0].code] }));
      }
    }
  }
  // Further evidence is summarised through user-approved wording below rather than
  // repeating resume bullets word-for-word (and implying the wrong employer).
  // Skills sentence from user-approved wording (different words from the resume bullets).
  const phrases: { text: string; code: string }[] = [];
  for (const f of prof) {
    const fl = licenseForFact(f);
    // Only hands-on wording fits "experience with …": never overstated wording, never "assisted with …".
    for (const w of f.allowedWording.filter((x) => !fl.wordingIssues.some((i) => i.phrase === x) && isExperienceWording(x))) {
      const lic = experienceConcepts(f);
      const relevant = analysis.requirements.some((r) => lic.has(r.conceptId) && w.toLowerCase().includes(conceptLabel(r.conceptId).toLowerCase().split(" ")[0]));
      if (relevant && !phrases.some((p) => p.text.toLowerCase() === w.toLowerCase())) phrases.push({ text: w, code: f.code });
    }
  }
  if (phrases.length >= 2) {
    const pick = phrases.slice(0, 3);
    const text = `Across my roles I have practical, day-to-day experience with ${pick.map((p) => p.text).join(pick.length === 3 ? ", " : " and ").replace(/, ([^,]*)$/, ", and $1")}.`;
    const codes = [...new Set(pick.map((p) => p.code))];
    if (supportable(ctx, text, codes, "letter", "SKILL")) body.push(b.add({ section: "letter", kind: "SKILL", text, supportingFactCodes: codes }));
  }

  // ── Paragraph 3: transferable experience, stated as transferable ──
  const bridges: string[] = [];
  const transferable = match.requirements
    .filter((r) => r.status === "TRANSFERABLE" && r.transfer)
    .sort((a, z) => (z.importance === "REQUIRED" ? 1 : 0) - (a.importance === "REQUIRED" ? 1 : 0) || (z.transfer!.strength - a.transfer!.strength));
  const usedFrom = new Set<string>();
  for (const r of transferable) {
    if (bridges.length >= 2) break;
    const t = r.transfer!;
    if (usedFrom.has(t.fromConceptId)) continue;
    const candidate = `My ${conceptPhrase(t.fromConceptId)} experience`;
    const target = `the ${conceptPhrase(r.conceptId)} work in this role.`;
    const codes = t.factCodes.slice(0, 2);
    const claim = {
      section: "letter" as const,
      kind: "BRIDGE" as const,
      text: `${candidate} is relevant to ${target}`,
      supportingFactCodes: codes,
      segments: [
        { role: "candidate" as const, text: candidate },
        { role: "connective" as const, text: "is relevant to" },
        { role: "target" as const, text: target },
      ],
    };
    const res = validateClaims([{ ...claim, id: "probe" }], ctx);
    if (res.status === "PASSED") {
      bridges.push(b.add(claim));
      usedFrom.add(t.fromConceptId);
    }
  }
  const learning = facts.filter((f) => !f.derived && f.experienceType === "LEARNING" && factRelevance(f, analysis) > 0).slice(0, 1);
  for (const f of learning) {
    const text = `I am also ${lcFirst(stripPeriod(f.canonicalFact))}.`;
    if (/^I am also (studying|learning|pursuing|preparing|completing|building|built)/i.test(text) && supportable(ctx, text, [f.code], "letter", "LEARNING")) {
      bridges.push(b.add({ section: "letter", kind: "LEARNING", text, supportingFactCodes: [f.code] }));
    }
  }

  const closing = b.add({ section: "letter", kind: "ROLE_REFERENCE", text: `I would welcome the chance to discuss how my background could support ${job.company}.`, supportingFactCodes: [] });
  const thanks = b.add({ section: "letter", kind: "COURTESY", text: "Thank you for your time and consideration.", supportingFactCodes: [] });
  const sign = b.add({ section: "letter", kind: "HEADER", text: `Sincerely,\n${name}`, supportingFactCodes: [] });

  const gate = validateClaims(b.claims, ctx);
  const fullText = b.claims.map((c) => c.text).join(" ");
  const relevantUnverified = s.facts.filter((f) => f.verificationStatus !== "VERIFIED" && !f.derived && factRelevance(f, analysis) > 0).map((f) => ({ code: f.code, text: f.canonicalFact }));

  return {
    kind: "COVER_LETTER",
    title: `Cover letter — ${job.title} at ${job.company}`,
    claims: b.claims,
    sections: [
      { id: "header", title: "", layout: "header", claimIds: header },
      { id: "greeting", title: "", layout: "letter", claimIds: [greeting] },
      { id: "p1", title: "", layout: "letter", claimIds: [opening] },
      ...(body.length ? [{ id: "p2", title: "", layout: "letter" as const, claimIds: body }] : []),
      ...(bridges.length ? [{ id: "p3", title: "", layout: "letter" as const, claimIds: bridges }] : []),
      { id: "p4", title: "", layout: "letter", claimIds: [closing, thanks] },
      { id: "sign", title: "", layout: "letter", claimIds: [sign] },
    ],
    positions: [],
    meta: {
      jobId: job.id,
      jobTitle: job.title,
      company: job.company,
      provider: "template",
      engineVersion: DOCUMENT_ENGINE_VERSION,
      generatedAt: now.toISOString(),
      excludedUnverified: relevantUnverified,
      styleWarnings: styleCheck(fullText, opts.resumeBullets),
      providerNotes: [],
    },
    gate,
  };
}
