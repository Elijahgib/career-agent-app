// Shared domain types. Pure TypeScript — no database or framework imports,
// so the Truth Gate, matching engine and generators are unit-testable.

export type VerificationStatus = "VERIFIED" | "UNVERIFIED";
export type Confidence = "HIGH" | "MEDIUM" | "LOW";
export type ExperienceType = "PROFESSIONAL" | "VOLUNTEER" | "ACADEMIC" | "PROJECT" | "LEARNING";
export type FactCategory =
  | "DUTY"
  | "ACHIEVEMENT"
  | "SKILL"
  | "TOOL"
  | "CERTIFICATION"
  | "LICENSE"
  | "PROJECT"
  | "LEARNING"
  | "SOFT_SKILL"
  | "CLEARANCE"
  // Derived (not stored as EvidenceFact rows):
  | "ROLE"
  | "EDUCATION";

export type CareerLevel = "ENTRY" | "EARLY" | "MID" | "SENIOR";
export type RemoteType = "REMOTE" | "HYBRID" | "ONSITE" | "UNKNOWN";
export type EmploymentType = "FULL_TIME" | "PART_TIME" | "CONTRACT" | "TEMP" | "INTERNSHIP" | "UNKNOWN";
export type RemotePreference = "REMOTE_ONLY" | "REMOTE_OR_HYBRID" | "ANY" | "ONSITE_PREFERRED";
export type ClearanceLevel = "NONE" | "PUBLIC_TRUST" | "SECRET" | "TOP_SECRET";
export type DegreeLevel = "HIGH_SCHOOL" | "CERTIFICATE" | "ASSOCIATE" | "BACHELOR" | "MASTER" | "DOCTORATE";
export type FieldVerification = "VERIFIED" | "LIKELY" | "UNKNOWN";

/**
 * How the candidate relates to the subject of a piece of evidence.
 * Ordered roughly strongest → weakest. See src/lib/evidence/relations.ts for
 * which evidence relation can authorize which claimed relation.
 */
export const RELATIONS = [
  "ADMINISTERED",
  "CONFIGURED",
  "INSTALLED",
  "REPAIRED",
  "TROUBLESHOT",
  "SUPPORTED",
  "PERFORMED",
  "USED",
  "ASSISTED",
  "WORKED_ALONGSIDE",
  "OBSERVED",
  "ESCALATED_TO",
  "STUDIED",
  "LAB_ONLY",
  "MENTIONED_ONLY",
] as const;
export type Relation = (typeof RELATIONS)[number];

/** One row of the Evidence Ledger, as seen by the Truth Gate and generators. */
export interface LedgerFact {
  /** Human-facing id: FACT-012 for stored facts, ROLE-n / EDU-n for derived ones. */
  code: string;
  id: string;
  positionId?: string | null;
  context?: string | null;
  roleContext?: string | null;
  category: FactCategory;
  experienceType: ExperienceType;
  canonicalFact: string;
  source: string;
  verificationStatus: VerificationStatus;
  confidence: Confidence;
  conceptIds: string[];
  allowedWording: string[];
  prohibitedExpansions: string[];
  /**
   * Explicit, user-confirmed relationship(s) to the fact's subject. Empty = inferred
   * from the canonical text. Explicit relations can only narrow what the text supports.
   */
  relations: Relation[];
  startDate?: string | null;
  endDate?: string | null;
  /** true for ROLE / EDU facts derived from positions and education. */
  derived?: boolean;
}

export interface PositionRecord {
  id: string;
  employer: string;
  title: string;
  location?: string | null;
  employmentType?: string | null;
  startDate: string;
  endDate?: string | null;
  verificationStatus: VerificationStatus;
  sortOrder?: number;
}

export interface EducationRecord {
  id: string;
  institution: string;
  credential: string;
  level: DegreeLevel;
  field?: string | null;
  status: "COMPLETED" | "IN_PROGRESS" | "INCOMPLETE";
  startDate?: string | null;
  endDate?: string | null;
  verificationStatus: VerificationStatus;
}

export interface PreferencesRecord {
  targetTitles: string[];
  targetKeywords: string[];
  desiredSalaryMin?: number | null;
  salaryHardFloor?: number | null;
  salaryCurrency: string;
  remotePreference: RemotePreference;
  acceptableLocations: string[];
  willingToRelocate: boolean;
  employmentTypes: EmploymentType[];
  excludedEmploymentTypes: EmploymentType[];
  excludedCompanies: string[];
  excludedKeywords: string[];
  securityClearance: ClearanceLevel;
  hasDriversLicense: boolean;
  canTravelPercent?: number | null;
  workAuthorization?: string | null;
}

export interface ProfileRecord {
  id: string;
  displayName: string;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  links: string[];
  careerLevel: CareerLevel;
}

/** Everything the engines need about one candidate. */
export interface CandidateSnapshot {
  profile: ProfileRecord;
  preferences: PreferencesRecord;
  positions: PositionRecord[];
  education: EducationRecord[];
  /** Stored facts plus derived ROLE/EDU facts. */
  facts: LedgerFact[];
}

export interface JobSourceRecord {
  sourceType: string;
  sourceName: string;
  externalId: string;
  url?: string | null;
  postedAt?: Date | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

export interface JobRecord {
  id: string;
  title: string;
  company: string;
  location?: string | null;
  remoteType: RemoteType;
  employmentType: EmploymentType;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: "YEAR" | "HOUR" | null;
  description: string;
  applyUrl?: string | null;
  reqId?: string | null;
  department?: string | null;
  status: "ACTIVE" | "CLOSED" | "UNKNOWN";
  postedAt?: Date | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  lastVerifiedAt?: Date | null;
  fieldVerification: Partial<Record<JobVerifiableField, FieldVerification>>;
  sources?: JobSourceRecord[];
}

export type JobVerifiableField =
  | "postingExists"
  | "title"
  | "location"
  | "remoteType"
  | "salary"
  | "employmentType"
  | "requiredExperience"
  | "education"
  | "hardRequirements"
  | "applyUrl"
  | "postedAt";
