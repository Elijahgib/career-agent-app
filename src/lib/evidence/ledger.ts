import type { EducationRecord, LedgerFact, PositionRecord } from "@/lib/domain/types";
import { getConcept } from "@/lib/ontology/concepts";
import { phraseConceptIds } from "@/lib/ontology/detect";
import { EXPERIENCE_RELATIONS, LEARNING_RELATIONS, computeFactRelations, satisfies, type FactRelations, type WordingIssue } from "./relations";
import type { Relation } from "@/lib/domain/types";

export const PROFESSIONAL_TYPES = new Set(["PROFESSIONAL", "VOLUNTEER"]);

export function isProfessional(f: LedgerFact): boolean {
  return PROFESSIONAL_TYPES.has(f.experienceType);
}

export function formatYm(ym?: string | null): string {
  if (!ym) return "Present";
  const [y, m] = ym.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mi = Number(m) - 1;
  return months[mi] ? `${months[mi]} ${y}` : y;
}

/** ROLE-n facts: "the candidate held title T at employer E" — licenses title claims. */
export function deriveRoleFacts(positions: PositionRecord[]): LedgerFact[] {
  return sortPositions(positions).map((p, i) => ({
    code: `ROLE-${i + 1}`,
    id: `role:${p.id}`,
    positionId: p.id,
    context: p.employer,
    roleContext: p.title,
    category: "ROLE",
    experienceType: p.employmentType === "VOLUNTEER" ? "VOLUNTEER" : "PROFESSIONAL",
    canonicalFact: `${p.title} at ${p.employer}${p.location ? `, ${p.location}` : ""} (${formatYm(p.startDate)} – ${formatYm(p.endDate)})`,
    source: "Work history",
    verificationStatus: p.verificationStatus,
    confidence: "HIGH",
    conceptIds: [],
    allowedWording: [],
    prohibitedExpansions: [],
    relations: [],
    startDate: p.startDate,
    endDate: p.endDate ?? null,
    derived: true,
  }));
}

/** EDU-n facts: credentials. Academic, so they never license professional-experience claims. */
export function deriveEducationFacts(education: EducationRecord[]): LedgerFact[] {
  return education.map((e, i) => {
    const when = e.status === "IN_PROGRESS" ? "in progress" : e.status === "INCOMPLETE" ? "coursework, not completed" : e.endDate ? e.endDate.slice(0, 4) : "completed";
    return {
      code: `EDU-${i + 1}`,
      id: `edu:${e.id}`,
      context: e.institution,
      roleContext: e.credential,
      category: "EDUCATION",
      experienceType: "ACADEMIC",
      canonicalFact: `${e.credential}${e.field && !e.credential.toLowerCase().includes(e.field.toLowerCase()) ? `, ${e.field}` : ""} — ${e.institution} (${when})`,
      source: "Education history",
      verificationStatus: e.verificationStatus,
      confidence: "HIGH",
      conceptIds: [],
      allowedWording: [],
      prohibitedExpansions: [],
      relations: [],
      startDate: e.startDate ?? null,
      endDate: e.endDate ?? null,
      derived: true,
    } satisfies LedgerFact;
  });
}

export function sortPositions<T extends { startDate: string; endDate?: string | null; sortOrder?: number }>(positions: T[]): T[] {
  return [...positions].sort((a, b) => {
    const ae = a.endDate ?? "9999-99";
    const be = b.endDate ?? "9999-99";
    if (ae !== be) return be.localeCompare(ae);
    return b.startDate.localeCompare(a.startDate);
  });
}

export function buildLedger(stored: LedgerFact[], positions: PositionRecord[], education: EducationRecord[]): LedgerFact[] {
  return [...stored, ...deriveRoleFacts(positions), ...deriveEducationFacts(education)];
}

// ─────────────────────────── Licensing ───────────────────────────

export interface FactLicense {
  code: string;
  /** Concepts this fact allows the app to mention (after implies-closure, minus prohibitions). */
  concepts: Set<string>;
  /** Concepts removed because the fact explicitly prohibits them. */
  prohibitedConcepts: Set<string>;
  professional: boolean;
  /** conceptId → relationship(s) the fact shows for it (FACT + RELATIONSHIP + CONTEXT + ALLOWED WORDING). */
  relations: Map<string, Set<Relation>>;
  /** Fact-level relationship analysis (ceiling, weakly governed concepts, rejected wording). */
  analysis: FactRelations;
  /** Allowed-wording phrases that claim more than the fact's relationship supports (ignored). */
  wordingIssues: WordingIssue[];
}

const licenseCache = new Map<string, FactLicense>();

function cacheKey(f: LedgerFact): string {
  return JSON.stringify([f.code, f.category, f.experienceType, f.canonicalFact, f.conceptIds, f.allowedWording, f.prohibitedExpansions, f.relations, f.roleContext ?? ""]);
}

export function licenseForFact(f: LedgerFact): FactLicense {
  const key = cacheKey(f);
  const hit = licenseCache.get(key);
  if (hit) return hit;
  // Licensing and relationship analysis are one pass: a concept is licensed only through text,
  // tags or allowed wording that the fact's relationship actually supports.
  const analysis = computeFactRelations(f);
  const concepts = new Set(analysis.byConcept.keys());
  const prohibited = new Set<string>();
  for (const p of f.prohibitedExpansions) for (const id of phraseConceptIds(p)) prohibited.add(id);
  for (const id of prohibited) {
    // Prohibitions win over everything inferred; only an explicit concept tag overrides them.
    if (!f.conceptIds.includes(id)) concepts.delete(id);
  }
  const relations = new Map<string, Set<Relation>>();
  for (const c of concepts) relations.set(c, analysis.byConcept.get(c) ?? new Set());
  const lic: FactLicense = {
    code: f.code,
    concepts,
    prohibitedConcepts: prohibited,
    professional: PROFESSIONAL_TYPES.has(f.experienceType),
    relations,
    analysis,
    wordingIssues: analysis.wordingIssues,
  };
  if (licenseCache.size > 5000) licenseCache.clear();
  licenseCache.set(key, lic);
  return lic;
}

/** Relationship(s) a fact shows for a concept (empty if it doesn't license it). */
export function factRelationsFor(f: LedgerFact, conceptId: string): Set<Relation> {
  return licenseForFact(f).relations.get(conceptId) ?? new Set();
}

/** Does the fact show hands-on experience (not just study or exposure) with the concept? */
export function showsExperience(f: LedgerFact, conceptId: string): boolean {
  return [...factRelationsFor(f, conceptId)].some((r) => EXPERIENCE_RELATIONS.has(r));
}

/**
 * Does the fact show the concept at the level a bare mention of it claims (its own activity, or use)?
 * "Used Intune to check compliance" shows MDM use, not the MDM administration a requirement means.
 */
export function sufficesFor(f: LedgerFact, conceptId: string): boolean {
  const need = getConcept(conceptId)?.intrinsic ?? "USED";
  return [...factRelationsFor(f, conceptId)].some((r) => satisfies(r, need));
}

/** Concepts the fact shows hands-on experience with (not escalation, observation or study). */
export function experienceConcepts(f: LedgerFact): Set<string> {
  return new Set([...licenseForFact(f).concepts].filter((c) => showsExperience(f, c)));
}

export interface ConceptEvidence {
  conceptId: string;
  /** Verified facts showing experience or study (not mere exposure). */
  verified: LedgerFact[];
  unverified: LedgerFact[];
  /** Verified professional/volunteer facts showing the concept at the level it names. */
  professional: LedgerFact[];
  /** Verified professional/volunteer facts with hands-on contact below that level (used Intune ≠ MDM administration). */
  partial: LedgerFact[];
  /** Verified facts that only show exposure (escalated, observed, worked alongside, assisted, mentioned). */
  exposure: LedgerFact[];
}

/** Index: concept → facts that license it, classified by relationship. */
export function conceptEvidenceIndex(facts: LedgerFact[]): Map<string, ConceptEvidence> {
  const idx = new Map<string, ConceptEvidence>();
  for (const f of facts) {
    const lic = licenseForFact(f);
    for (const c of lic.concepts) {
      let e = idx.get(c);
      if (!e) {
        e = { conceptId: c, verified: [], unverified: [], professional: [], partial: [], exposure: [] };
        idx.set(c, e);
      }
      if (f.verificationStatus !== "VERIFIED") {
        e.unverified.push(f);
        continue;
      }
      const rels = [...(lic.relations.get(c) ?? [])];
      const experience = rels.some((r) => EXPERIENCE_RELATIONS.has(r));
      const learning = rels.some((r) => LEARNING_RELATIONS.has(r));
      if (experience || learning) {
        e.verified.push(f);
        if (experience && PROFESSIONAL_TYPES.has(f.experienceType)) (sufficesFor(f, c) ? e.professional : e.partial).push(f);
      } else e.exposure.push(f);
    }
  }
  return idx;
}

/** What a fact lets the app say — shown in the ledger UI at verification time. */
export function licensedConceptIds(f: LedgerFact): string[] {
  return [...licenseForFact(f).concepts].sort();
}

/** Suggested prohibited expansions for a fact, from the ontology's known overstatements. */
export function suggestProhibitedExpansions(f: LedgerFact): string[] {
  const lic = licenseForFact(f);
  const out = new Set<string>();
  for (const id of lic.concepts) {
    for (const o of getConcept(id)?.overstatements ?? []) {
      const oIds = phraseConceptIds(o);
      const alreadyLicensed = [...oIds].some((x) => lic.concepts.has(x));
      if (!alreadyLicensed && !f.prohibitedExpansions.some((p) => p.toLowerCase() === o.toLowerCase())) out.add(o);
    }
  }
  return [...out];
}

/** Professional months per position (for experience-years math). */
export function monthsBetween(start: string, end?: string | null, now = new Date()): number {
  const [sy, sm] = start.split("-").map(Number);
  let ey: number, em: number;
  if (end) [ey, em] = end.split("-").map(Number);
  else {
    ey = now.getUTCFullYear();
    em = now.getUTCMonth() + 1;
  }
  return Math.max(0, (ey - sy) * 12 + (em - (sm || 1)) + 1);
}
