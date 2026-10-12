// Tailored resume generation. Tailoring = ordering, emphasis, supported
// synonyms and selection. Canonical facts are never rewritten to fit a job.

import type { AIProvider } from "@/lib/ai";
import type { CandidateSnapshot, JobRecord, LedgerFact } from "@/lib/domain/types";
import { experienceConcepts, isProfessional, licenseForFact } from "@/lib/evidence/ledger";
import { analyzeJob, type JobAnalysis } from "@/lib/jobs/analyze";
import { factRelevance } from "@/lib/matching/engine";
import { getConcept, isCompetencyEligible } from "@/lib/ontology/concepts";
import { validateClaims, type GateContext } from "@/lib/truth-gate/gate";
import {
  ClaimBuilder,
  conceptPhrase,
  joinList,
  lcFirst,
  professionalConcepts,
  rankedFacts,
  roleFactFor,
  stripPeriod,
  supportable,
  verifiedFacts,
  verifiedPositions,
} from "./common";
import { DOCUMENT_ENGINE_VERSION, type DocSection, type GeneratedDocument, type PositionBlock } from "./types";

const IMPORTANCE_WEIGHT = { REQUIRED: 1, UNSPECIFIED: 0.75, RESPONSIBILITY: 0.5, PREFERRED: 0.4 } as const;
const BULLET_CATEGORIES = new Set(["DUTY", "ACHIEVEMENT", "TOOL", "SKILL", "SOFT_SKILL"]);

export interface ResumeOptions {
  provider?: AIProvider;
  now?: Date;
  /** Override the one-page budget (default: on for ENTRY/EARLY). */
  onePage?: boolean;
}

function contactLine(s: CandidateSnapshot): string {
  const p = s.profile;
  const loc = [p.city, p.region].filter(Boolean).join(", ");
  return [loc, p.email, p.phone, ...p.links].filter(Boolean).join(" · ");
}

export async function generateResume(s: CandidateSnapshot, job: JobRecord | null, opts: ResumeOptions = {}): Promise<GeneratedDocument> {
  const now = opts.now ?? new Date();
  const analysis: JobAnalysis | null = job ? analyzeJob(job) : null;
  const ctx: GateContext = { facts: s.facts, job: job ? { title: job.title, company: job.company, requirementConceptIds: analysis!.requirements.map((r) => r.conceptId) } : null };
  const b = new ClaimBuilder();
  const sections: DocSection[] = [];
  const positionsOut: PositionBlock[] = [];
  const providerNotes: string[] = [];
  const facts = verifiedFacts(s);
  const prof = professionalConcepts(s);
  const reqWeight = new Map<string, number>();
  for (const r of analysis?.requirements ?? []) reqWeight.set(r.conceptId, Math.max(reqWeight.get(r.conceptId) ?? 0, IMPORTANCE_WEIGHT[r.importance]));

  // ── Header ──
  const nameId = b.add({ section: "header", kind: "HEADER", text: s.profile.displayName.replace(/\s*\(demo\)\s*$/i, ""), supportingFactCodes: [] });
  const contactId = b.add({ section: "header", kind: "HEADER", text: contactLine(s), supportingFactCodes: [] });
  sections.push({ id: "header", title: "", layout: "header", claimIds: [nameId, contactId] });

  // ── Summary ──
  const positions = verifiedPositions(s);
  const summaryIds: string[] = [];
  const latest = positions[0];
  const latestRole = latest ? roleFactFor(s, latest.id) : undefined;
  if (latest && latestRole) {
    const candidates = [...prof.keys()]
      .filter((id) => {
        const c = getConcept(id);
        return c && isCompetencyEligible(c) && c.kind !== "title" && c.kind !== "environment" && c.id !== "technical-troubleshooting";
      })
      .map((id) => ({ id, w: reqWeight.get(id) ?? 0, n: prof.get(id)!.length }))
      .sort((a, z) => z.w - a.w || z.n - a.n);
    const chosen: string[] = [];
    for (const c of candidates) {
      if (chosen.length >= 3) break;
      const trial = [...chosen, c.id];
      const codes = [latestRole.code, ...new Set(trial.flatMap((id) => prof.get(id)!.slice(0, 2)))];
      const text = `${latest.title} with hands-on experience in ${joinList(trial.map(conceptPhrase))}.`;
      if (supportable(ctx, text, codes, "summary", "SUMMARY")) chosen.push(c.id);
    }
    if (chosen.length) {
      const codes = [latestRole.code, ...new Set(chosen.flatMap((id) => prof.get(id)!.slice(0, 2)))];
      summaryIds.push(b.add({ section: "summary", kind: "SUMMARY", text: `${latest.title} with hands-on experience in ${joinList(chosen.map(conceptPhrase))}.`, supportingFactCodes: codes }));
    }
  }
  // Relevant learning, stated as learning.
  const learning = facts.filter((f) => !f.derived && (f.experienceType === "LEARNING") && (!analysis || factRelevance(f, analysis) > 0));
  for (const f of learning.slice(0, 1)) {
    const text = `Currently ${lcFirst(stripPeriod(f.canonicalFact))}.`;
    if (/^Currently (studying|learning|pursuing|preparing|completing)/i.test(text) && supportable(ctx, text, [f.code], "summary", "LEARNING")) {
      summaryIds.push(b.add({ section: "summary", kind: "LEARNING", text, supportingFactCodes: [f.code] }));
    }
  }
  if (summaryIds.length) sections.push({ id: "summary", title: "Summary", layout: "paragraph", claimIds: summaryIds });

  // ── Core competencies ──
  const compIds: string[] = [];
  const usedConcepts = new Set<string>();
  const compCandidates = [...prof.keys()]
    .filter((id) => {
      const c = getConcept(id);
      return c && isCompetencyEligible(c) && !["title", "environment", "certification", "license", "clearance"].includes(c.kind);
    })
    .map((id) => ({ id, w: reqWeight.get(id) ?? 0, n: prof.get(id)!.length }))
    .sort((a, z) => z.w - a.w || z.n - a.n);
  const maxComp = 10;
  for (const c of compCandidates) {
    if (compIds.length >= maxComp) break;
    // Skip a concept already implied by a more specific chosen one (e.g. "Technical troubleshooting" after "Hardware troubleshooting").
    if ([...usedConcepts].some((u) => getConcept(u)?.implies?.includes(c.id))) continue;
    const label = getConcept(c.id)!.label;
    const codes = prof.get(c.id)!.slice(0, 3);
    if (!supportable(ctx, label, codes, "competencies", "SKILL")) continue;
    usedConcepts.add(c.id);
    compIds.push(b.add({ section: "competencies", kind: "SKILL", text: label, supportingFactCodes: codes }));
  }
  if (compIds.length) sections.push({ id: "competencies", title: "Core Competencies", layout: "inline-list", claimIds: compIds });

  // ── Experience ──
  const onePage = opts.onePage ?? ["ENTRY", "EARLY"].includes(s.profile.careerLevel);
  const bulletBudget = onePage ? 12 : 22;
  let bulletsUsed = 0;
  const posBullets: { posId: string; facts: LedgerFact[] }[] = [];
  positions.forEach((p, i) => {
    const pf = facts.filter((f) => f.positionId === p.id && !f.derived && isProfessional(f) && BULLET_CATEGORIES.has(f.category));
    const ranked = rankedFacts(pf, analysis);
    const cap = i === 0 ? 6 : 4;
    posBullets.push({ posId: p.id, facts: ranked.slice(0, cap) });
  });
  // Global budget: keep the most relevant bullets, at least 2 per position.
  const allBullets = posBullets.flatMap((pb, pi) => pb.facts.map((f, fi) => ({ pb, f, keep: fi < 2, r: analysis ? factRelevance(f, analysis) : 0, pi, fi })));
  const kept = new Set<LedgerFact>();
  for (const x of allBullets.filter((x) => x.keep)) kept.add(x.f);
  for (const x of allBullets.filter((x) => !x.keep).sort((a, z) => z.r - a.r || a.pi - z.pi)) {
    if (kept.size >= bulletBudget) break;
    kept.add(x.f);
  }

  const expBlockIds: string[] = [];
  for (const p of positions) {
    const role = roleFactFor(s, p.id);
    if (!role) continue;
    const dates = role.canonicalFact.match(/\(([^)]*)\)\s*$/)?.[1] ?? "";
    const headerText = `${p.title} — ${p.employer}${p.location ? `, ${p.location}` : ""}${dates ? ` | ${dates}` : ""}`;
    const headerId = b.add({ section: "experience", kind: "EXPERIENCE", text: headerText, supportingFactCodes: [role.code], positionId: p.id });
    expBlockIds.push(headerId);
    const block: PositionBlock = { positionId: p.id, headerClaimId: headerId, bulletClaimIds: [] };
    const pb = posBullets.find((x) => x.posId === p.id)!;
    for (const f of pb.facts.filter((f) => kept.has(f))) {
      let text = stripPeriod(f.canonicalFact);
      let origin: "template" | "ai" = "template";
      if (opts.provider && opts.provider.name !== "template") {
        try {
          const emphasis = [...experienceConcepts(f)].filter((id) => reqWeight.has(id)).map(conceptPhrase);
          text = await opts.provider.rewriteBullet({
            factCode: f.code,
            factText: f.canonicalFact,
            // Only wording the fact's relationship supports; overstated wording is never suggested to the model.
            allowedWording: f.allowedWording.filter((w) => !licenseForFact(f).wordingIssues.some((i) => i.phrase === w)),
            prohibitedExpansions: f.prohibitedExpansions,
            emphasis,
            jobTitle: job?.title,
          });
          origin = "ai";
        } catch (e) {
          providerNotes.push(`${f.code}: AI rewrite failed (${(e as Error).message}); used the verified canonical text.`);
        }
      }
      const id = b.add({ section: "experience", kind: "EXPERIENCE", text, supportingFactCodes: [f.code], positionId: p.id, origin });
      block.bulletClaimIds.push(id);
      bulletsUsed++;
    }
    positionsOut.push(block);
  }
  if (positionsOut.length) sections.push({ id: "experience", title: "Experience", layout: "positions", claimIds: expBlockIds });

  // ── Certifications & licenses ──
  const certIds: string[] = [];
  for (const f of facts.filter((f) => (f.category === "CERTIFICATION" || f.category === "LICENSE") && f.experienceType !== "LEARNING")) {
    certIds.push(b.add({ section: "certifications", kind: "CREDENTIAL", text: stripPeriod(f.canonicalFact), supportingFactCodes: [f.code] }));
  }
  if (certIds.length) sections.push({ id: "certifications", title: "Certifications & Licenses", layout: "bullets", claimIds: certIds });

  // ── Projects & training (never presented as work experience) ──
  const projIds: string[] = [];
  const projFacts = rankedFacts(
    facts.filter((f) => !f.derived && ["LEARNING", "PROJECT", "ACADEMIC"].includes(f.experienceType) && !["CERTIFICATION", "LICENSE"].includes(f.category)),
    analysis,
  ).slice(0, onePage ? 3 : 5);
  for (const f of projFacts) projIds.push(b.add({ section: "projects", kind: "LEARNING", text: stripPeriod(f.canonicalFact), supportingFactCodes: [f.code] }));
  if (projIds.length) sections.push({ id: "projects", title: "Projects & Training", layout: "bullets", claimIds: projIds });

  // ── Education ──
  const eduIds: string[] = [];
  for (const f of facts.filter((f) => f.category === "EDUCATION")) eduIds.push(b.add({ section: "education", kind: "EDUCATION", text: f.canonicalFact, supportingFactCodes: [f.code] }));
  if (eduIds.length) sections.push({ id: "education", title: "Education", layout: "bullets", claimIds: eduIds });

  // ── One-page estimate ──
  const lineOf = (t: string) => Math.max(1, Math.ceil(t.length / 95));
  const claimText = (id: string) => b.claims.find((c) => c.id === id)!.text;
  const estimatedLines =
    3 +
    sections.length * 1.5 +
    summaryIds.reduce((n, id) => n + lineOf(claimText(id)), 0) +
    Math.ceil(compIds.length / 4) +
    positionsOut.reduce((n, p) => n + 1 + p.bulletClaimIds.reduce((m, id) => m + lineOf(claimText(id)), 0), 0) +
    certIds.length + projIds.reduce((n, id) => n + lineOf(claimText(id)), 0) + eduIds.length;

  const relevantUnverified = s.facts
    .filter((f) => f.verificationStatus !== "VERIFIED" && !f.derived && (!analysis || factRelevance(f, analysis) > 0))
    .map((f) => ({ code: f.code, text: f.canonicalFact }));

  const gate = validateClaims(b.claims, ctx);
  const styleWarnings: string[] = [];
  if (onePage && estimatedLines > 54) styleWarnings.push(`Estimated ${Math.round(estimatedLines)} lines — may run past one page.`);
  if (!bulletsUsed) styleWarnings.push("No verified experience bullets yet — verify facts in the Evidence Ledger.");

  return {
    kind: "RESUME",
    title: job ? `Resume — ${job.title} at ${job.company}` : "Resume — general",
    claims: b.claims,
    sections,
    positions: positionsOut,
    meta: {
      jobId: job?.id,
      jobTitle: job?.title,
      company: job?.company,
      provider: opts.provider?.name ?? "template",
      engineVersion: DOCUMENT_ENGINE_VERSION,
      generatedAt: now.toISOString(),
      estimatedLines: Math.round(estimatedLines),
      onePageTarget: onePage,
      excludedUnverified: relevantUnverified,
      styleWarnings,
      providerNotes,
    },
    gate,
  };
}
