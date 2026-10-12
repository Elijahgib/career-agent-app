import type { LedgerFact } from "@/lib/domain/types";
import { checkStatement, type GateContext } from "@/lib/truth-gate/gate";
import type { ClaimKind, ClaimResult, ClaimSection } from "@/lib/truth-gate/types";

/** Minimal synthetic fact builder for tests. */
export function fact(code: string, canonicalFact: string, extra: Partial<LedgerFact> = {}): LedgerFact {
  return {
    code,
    id: code,
    positionId: "pos-a",
    context: "Synthetic Retail Co",
    roleContext: "Field Service Technician",
    category: "DUTY",
    experienceType: "PROFESSIONAL",
    canonicalFact,
    source: "test fixture",
    verificationStatus: "VERIFIED",
    confidence: "HIGH",
    conceptIds: [],
    allowedWording: [],
    prohibitedExpansions: [],
    relations: [],
    ...extra,
  };
}

export function ctxOf(...facts: LedgerFact[]): GateContext {
  return { facts };
}

export function check(
  ctx: GateContext,
  text: string,
  codes: string[],
  opts: { section?: ClaimSection; kind?: ClaimKind; positionId?: string | null } = {},
): ClaimResult {
  return checkStatement(text, codes, ctx, opts);
}

export function rules(r: ClaimResult): string[] {
  return r.violations.map((v) => v.rule);
}

export function phrases(r: ClaimResult): string[] {
  return r.violations.map((v) => v.phrase.toLowerCase());
}
