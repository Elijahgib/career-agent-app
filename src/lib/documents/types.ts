import type { Claim, GateReport } from "@/lib/truth-gate/types";

export type DocumentKind = "RESUME" | "COVER_LETTER" | "INTERVIEW_PREP";

export interface DocSection {
  id: string;
  title: string;
  layout: "header" | "paragraph" | "inline-list" | "bullets" | "positions" | "letter";
  claimIds: string[];
}

export interface PositionBlock {
  positionId: string;
  headerClaimId: string;
  bulletClaimIds: string[];
}

export interface GeneratedDocument {
  kind: DocumentKind;
  title: string;
  claims: Claim[];
  sections: DocSection[];
  positions: PositionBlock[];
  meta: {
    jobId?: string;
    jobTitle?: string;
    company?: string;
    provider: string;
    engineVersion: string;
    generatedAt: string;
    estimatedLines?: number;
    onePageTarget?: boolean;
    /** Relevant facts left out because they are not verified yet. */
    excludedUnverified: { code: string; text: string }[];
    /** Tone/style notes (not truth violations). */
    styleWarnings: string[];
    /** AI rewrite failures that fell back to verified canonical text. */
    providerNotes: string[];
  };
  gate: GateReport;
}

export const DOCUMENT_ENGINE_VERSION = "docs/1.0.0";
