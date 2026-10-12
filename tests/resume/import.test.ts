// The core truth guarantee for resume import: imported facts are UNVERIFIED, and an UNVERIFIED
// fact can never authorize a generated claim — the Truth Gate blocks it.
import { describe, expect, it } from "vitest";
import { check, ctxOf, fact, rules } from "../truth-gate/helpers";

describe("imported resume content cannot pass the Truth Gate until verified", () => {
  it("blocks a claim citing an UNVERIFIED imported skill", () => {
    const imported = fact("FACT-001", "Kubernetes administration", { verificationStatus: "UNVERIFIED", category: "SKILL", source: "Imported resume (skill list) — classify & verify" });
    const r = check(ctxOf(imported), "Kubernetes administration", ["FACT-001"], { section: "competencies", kind: "SKILL" });
    expect(r.status).toBe("BLOCKED");
    expect(rules(r)).toContain("UNVERIFIED_EVIDENCE");
  });

  it("allows the same claim only once the imported fact is verified", () => {
    const verified = fact("FACT-001", "Kubernetes administration", { verificationStatus: "VERIFIED", category: "SKILL" });
    const r = check(ctxOf(verified), "Kubernetes administration", ["FACT-001"], { section: "competencies", kind: "SKILL" });
    expect(r.status).toBe("PASSED");
  });
});
