// Claims are the unit of truth. Every sentence, bullet and competency that a
// generator emits is a Claim with the fact codes that support it.

export type ClaimKind =
  | "EXPERIENCE" // a thing the candidate did (bullets, letter sentences)
  | "SKILL" // a competency / skill statement
  | "SUMMARY" // professional summary sentence
  | "CREDENTIAL" // certification / license line
  | "EDUCATION" // education line
  | "LEARNING" // training, lab or project — never presented as professional experience
  | "BRIDGE" // structured "my X is relevant to this role's Y" sentence
  | "HONEST_GAP" // structured "I haven't done X professionally yet" sentence
  | "ROLE_REFERENCE" // mentions the target job/company, asserts nothing about the candidate
  | "COURTESY" // greetings / sign-offs — must assert nothing
  | "HEADER"; // name & contact details straight from the profile

export type ClaimSection =
  | "header"
  | "summary"
  | "competencies"
  | "experience"
  | "education"
  | "certifications"
  | "projects"
  | "letter"
  | "interview";

export interface ClaimSegment {
  text: string;
  role: "candidate" | "target" | "connective";
  /** For candidate segments inside BRIDGE / HONEST_GAP claims. */
  supportingFactCodes?: string[];
}

export interface Claim {
  id: string;
  section: ClaimSection;
  kind: ClaimKind;
  text: string;
  supportingFactCodes: string[];
  /** Experience bullets: the position the bullet is listed under. */
  positionId?: string | null;
  segments?: ClaimSegment[];
  origin?: "template" | "ai" | "user";
}

export type ViolationRule =
  | "NO_EVIDENCE"
  | "UNKNOWN_FACT"
  | "UNVERIFIED_EVIDENCE"
  | "UNSUPPORTED_CONCEPT"
  | "PROHIBITED_EXPANSION"
  | "LEARNING_AS_EXPERIENCE"
  | "CERTIFICATION_NOT_EARNED"
  | "UNSUPPORTED_TITLE"
  | "UNSUPPORTED_METRIC"
  | "RESPONSIBILITY_INFLATION"
  | "UNSUPPORTED_TERM"
  | "CONTEXT_MISMATCH"
  | "MALFORMED_BRIDGE"
  | "ASSERTION_IN_REFERENCE"
  | "RELATION_EXCEEDS_EVIDENCE";

export interface Violation {
  claimId: string;
  rule: ViolationRule;
  /** The exact unsupported phrase, as it appears in the claim. */
  phrase: string;
  message: string;
  conceptId?: string;
  factCodes?: string[];
  /** Honest alternative, e.g. a transferable framing. */
  hint?: string;
}

export interface ClaimResult {
  claimId: string;
  status: "PASSED" | "BLOCKED";
  violations: Violation[];
  /** conceptId → fact codes that license it, for the "Why can I say this?" view. */
  licensedBy: Record<string, string[]>;
}

export interface GateReport {
  status: "PASSED" | "BLOCKED";
  engineVersion: string;
  checkedClaims: number;
  violations: Violation[];
  claims: Record<string, ClaimResult>;
}
