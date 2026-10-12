import type { CandidateSnapshot, LedgerFact, PositionRecord } from "@/lib/domain/types";
import { conceptEvidenceIndex, isProfessional, sortPositions } from "@/lib/evidence/ledger";
import type { JobAnalysis } from "@/lib/jobs/analyze";
import { factRelevance } from "@/lib/matching/engine";
import { conceptLabel, getConcept } from "@/lib/ontology/concepts";
import { checkStatement, type GateContext } from "@/lib/truth-gate/gate";
import type { Claim, ClaimKind, ClaimSection } from "@/lib/truth-gate/types";

export class ClaimBuilder {
  claims: Claim[] = [];
  private n = 0;
  add(c: Omit<Claim, "id">): string {
    const id = `c${++this.n}`;
    this.claims.push({ ...c, id });
    return id;
  }
}

/** Lower-case a fact's first letter for mid-sentence use, unless it starts with an acronym/proper noun. */
export function lcFirst(s: string): string {
  const t = s.trim();
  if (/^[A-Z][a-z]/.test(t)) return t[0].toLowerCase() + t.slice(1);
  return t;
}

export function stripPeriod(s: string): string {
  return s.trim().replace(/\.\s*$/, "");
}

export function article(word: string): string {
  return /^[aeiou]/i.test(word) || /^(IT|SQL|HR|MRI|LAN)\b/.test(word) ? "an" : "a";
}

const KEEP_CASE_KINDS = new Set(["tool", "platform", "certification", "hardware"]);

/** A concept label for use mid-sentence: proper nouns and acronyms keep their case. */
export function conceptPhrase(id: string): string {
  const c = getConcept(id);
  if (!c) return id;
  const words = c.label.split(" / ")[0].split(/\s+/);
  if (/^[A-Z0-9]{2,}/.test(words[0]) || /[a-z][A-Z]/.test(words[0])) return c.label; // POS systems, ServiceNow
  if (words.length > 1 && words.slice(1).some((w) => /^[A-Z]/.test(w))) return c.label; // Microsoft Office, Windows Server
  if (words.length === 1 && KEEP_CASE_KINDS.has(c.kind) && c.kind !== "hardware") return c.label; // Windows, Excel, Jira
  return lcFirst(c.label);
}

export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/** Facts usable in generated documents: verified only. */
export function verifiedFacts(s: CandidateSnapshot): LedgerFact[] {
  return s.facts.filter((f) => f.verificationStatus === "VERIFIED");
}

export function roleFactFor(s: CandidateSnapshot, positionId: string): LedgerFact | undefined {
  return s.facts.find((f) => f.category === "ROLE" && f.positionId === positionId);
}

export function verifiedPositions(s: CandidateSnapshot): PositionRecord[] {
  return sortPositions(s.positions.filter((p) => p.verificationStatus === "VERIFIED"));
}

export function rankedFacts(facts: LedgerFact[], analysis: JobAnalysis | null): LedgerFact[] {
  return facts
    .map((f, i) => ({ f, i, r: analysis ? factRelevance(f, analysis) : 0 }))
    .sort((a, b) => b.r - a.r || a.i - b.i)
    .map((x) => x.f);
}

/** Pre-check a candidate phrasing; generators only emit wording the gate can support. */
export function supportable(ctx: GateContext, text: string, codes: string[], section: ClaimSection, kind: ClaimKind, positionId?: string | null): boolean {
  return checkStatement(text, codes, ctx, { section, kind, positionId }).status === "PASSED";
}

/** Professional, verified evidence per concept (for summaries and competencies). */
export function professionalConcepts(s: CandidateSnapshot): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [id, ev] of conceptEvidenceIndex(s.facts)) {
    const prof = ev.professional.filter((f) => f.verificationStatus === "VERIFIED" && isProfessional(f));
    if (prof.length) out.set(id, prof.map((f) => f.code));
  }
  return out;
}

export { conceptLabel };
