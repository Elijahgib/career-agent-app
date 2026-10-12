// Honest career-direction suggestions. Based ONLY on the candidate's VERIFIED professional
// evidence (and earned certifications) overlapping a role's core skills — never on a keyword
// appearing somewhere. Each suggestion shows exactly what you have and what you're missing.
import type { CandidateSnapshot } from "@/lib/domain/types";
import { conceptEvidenceIndex } from "@/lib/evidence/ledger";
import { conceptLabel } from "@/lib/ontology/concepts";

export type CareerTier = "GOOD_TRANSITION" | "REALISTIC_STRETCH" | "LONGER_TERM";

export interface CareerSuggestion {
  id: string;
  label: string;
  tier: CareerTier;
  have: string[]; // concept labels backed by verified evidence
  missing: string[]; // concept labels still to build
  rationale: string;
}

interface CareerPath {
  id: string;
  label: string;
  core: string[]; // ontology concept ids that realistically matter for the role
}

// Core skills per role, drawn from the real controlled vocabulary (src/lib/ontology/concepts.ts).
export const CAREER_PATHS: CareerPath[] = [
  { id: "desktop-support", label: "Desktop Support Technician", core: ["peripherals", "printers", "mobile-devices", "entra-id", "group-policy", "endpoint-security"] },
  { id: "help-desk", label: "Help Desk Technician", core: ["servicenow", "freshservice", "email-support", "chat-support", "documentation", "comptia-a-plus"] },
  { id: "it-support", label: "IT Support Specialist", core: ["peripherals", "printers", "windows-server", "entra-id", "documentation", "comptia-a-plus"] },
  { id: "field-service", label: "Field Service Technician", core: ["printers", "peripherals", "pos-systems", "payment-devices", "scanners", "drivers-license"] },
  { id: "network-technician", label: "Network Technician", core: ["routers-modems", "switches", "wireless", "cisco", "comptia-network-plus"] },
  { id: "network-engineer", label: "Network Engineer", core: ["switches", "routers-modems", "firewalls", "cisco", "ccna", "wireless"] },
  { id: "sysadmin", label: "Systems Administrator", core: ["windows-server", "group-policy", "entra-id", "powershell", "virtualization", "backups"] },
  { id: "data-center-tech", label: "Data Center Technician", core: ["data-center", "switches", "routers-modems", "peripherals", "backups"] },
  { id: "data-analyst", label: "Data Analyst", core: ["data-analysis", "sql", "excel", "power-bi", "tableau"] },
];

const RATIONALE: Record<CareerTier, string> = {
  GOOD_TRANSITION: "A natural next step — your verified experience already covers most of what this needs.",
  REALISTIC_STRETCH: "A realistic stretch — you have a solid base, with a few gaps to close first.",
  LONGER_TERM: "A longer-term path — some relevant experience, but several core skills to build before you'd be competitive.",
};

const TIER_RANK: Record<CareerTier, number> = { GOOD_TRANSITION: 3, REALISTIC_STRETCH: 2, LONGER_TERM: 1 };

export function suggestCareers(snapshot: CandidateSnapshot, opts: { limit?: number } = {}): CareerSuggestion[] {
  const idx = conceptEvidenceIndex(snapshot.facts);
  const hasVerified = (conceptId: string): boolean => {
    const e = idx.get(conceptId);
    if (!e) return false;
    if (e.professional.length) return true;
    // An earned certification or license counts as verified evidence for the skill.
    return e.verified.some((f) => (f.category === "CERTIFICATION" || f.category === "LICENSE") && f.experienceType !== "LEARNING");
  };

  const out: CareerSuggestion[] = [];
  for (const p of CAREER_PATHS) {
    const haveIds = p.core.filter(hasVerified);
    if (haveIds.length === 0) continue; // never suggest a role with no honest basis
    const missingIds = p.core.filter((c) => !haveIds.includes(c));
    const ratio = haveIds.length / p.core.length;
    const tier: CareerTier = ratio >= 0.55 ? "GOOD_TRANSITION" : ratio >= 0.25 ? "REALISTIC_STRETCH" : "LONGER_TERM";
    out.push({ id: p.id, label: p.label, tier, have: haveIds.map(conceptLabel), missing: missingIds.map(conceptLabel), rationale: RATIONALE[tier] });
  }
  return out
    .sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier] || b.have.length - a.have.length)
    .slice(0, opts.limit ?? 5);
}
