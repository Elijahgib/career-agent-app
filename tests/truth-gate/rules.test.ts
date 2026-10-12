import { describe, expect, it } from "vitest";
import { validateClaims } from "@/lib/truth-gate/gate";
import type { Claim } from "@/lib/truth-gate/types";
import { check, ctxOf, fact, rules } from "./helpers";

const stores = fact("FACT-007", "Supported Windows-based POS workstations and back-office PCs at 30 store locations.");
const repair = fact("FACT-001", "Diagnosed and repaired POS systems, printers, scanners and payment peripherals at retail store locations.", {
  allowedWording: ["hardware troubleshooting"],
  prohibitedExpansions: ["depot repair"],
});
const otherJob = fact("FACT-008", "Helped customers choose laptops and accessories and explained product features.", { positionId: "pos-b", context: "Synthetic Electronics" });
const ctx = ctxOf(stores, repair, otherJob);

describe("evidence requirements", () => {
  it("blocks claims with no evidence", () => {
    const r = check(ctx, "Hardware troubleshooting", [], { section: "competencies", kind: "SKILL" });
    expect(rules(r)).toEqual(["NO_EVIDENCE"]);
  });
  it("blocks claims citing facts that do not exist", () => {
    expect(rules(check(ctx, "Repaired printers.", ["FACT-999"]))).toContain("UNKNOWN_FACT");
  });
  it("blocks bullets citing evidence from another position", () => {
    const r = check(ctx, "Helped customers choose laptops and accessories and explained product features.", ["FACT-008"], { positionId: "pos-a" });
    expect(rules(r)).toContain("CONTEXT_MISMATCH");
  });
});

describe("metrics", () => {
  it("passes numbers present in evidence", () => {
    expect(check(ctx, "Supported Windows-based POS workstations at 30 store locations.", ["FACT-007"]).status).toBe("PASSED");
  });
  it("blocks invented numbers", () => {
    const r = check(ctx, "Supported Windows-based POS workstations at 45 store locations.", ["FACT-007"]);
    expect(rules(r)).toContain("UNSUPPORTED_METRIC");
  });
  it("blocks inflated '30+'", () => {
    expect(rules(check(ctx, "Supported POS workstations at 30+ store locations.", ["FACT-007"]))).toContain("UNSUPPORTED_METRIC");
  });
  it("blocks invented percentages and vague quantities", () => {
    expect(rules(check(ctx, "Repaired printers, cutting downtime by 35%.", ["FACT-001"]))).toContain("UNSUPPORTED_METRIC");
    expect(rules(check(ctx, "Repaired hundreds of printers.", ["FACT-001"]))).toContain("UNSUPPORTED_METRIC");
  });
});

describe("responsibility inflation", () => {
  it("blocks leadership and outcome verbs not in evidence", () => {
    expect(rules(check(ctx, "Led repairs of POS systems and printers.", ["FACT-001"]))).toContain("RESPONSIBILITY_INFLATION");
    expect(rules(check(ctx, "Improved POS uptime at retail store locations.", ["FACT-001"]))).toContain("RESPONSIBILITY_INFLATION");
    // "supervised" is also a team-leadership concept; either way it must be blocked by name.
    const sup = check(ctx, "Supervised printer repairs.", ["FACT-001"]);
    expect(sup.status).toBe("BLOCKED");
    expect(sup.violations.map((v) => v.phrase.toLowerCase())).toContain("supervised");
  });
});

describe("invented tools and proper names", () => {
  it("blocks tools that are not in the evidence, even if unknown to the ontology", () => {
    const r = check(ctx, "Tracked printer repairs in Salesforce.", ["FACT-001"]);
    expect(rules(r)).toContain("UNSUPPORTED_TERM");
    expect(r.violations.find((v) => v.rule === "UNSUPPORTED_TERM")?.phrase).toBe("Salesforce");
  });
  it("blocks known tools that are not licensed", () => {
    expect(rules(check(ctx, "Logged repairs in ServiceNow.", ["FACT-001"]))).toContain("UNSUPPORTED_CONCEPT");
  });
});

describe("user-defined prohibited expansions", () => {
  it("blocks a prohibited phrase even when the ontology does not know it", () => {
    const r = check(ctx, "Performed depot repair on POS systems.", ["FACT-001"]);
    expect(rules(r)).toContain("PROHIBITED_EXPANSION");
    expect(r.violations[0].message).toMatch(/FACT-001/);
  });
});

describe("structured cover-letter claims", () => {
  const job = { title: "Desktop Support Technician", company: "Synthetic Health", requirementConceptIds: ["desktop-support", "active-directory", "sccm"] };
  const jctx = { facts: [stores, repair, otherJob], job };

  it("passes honest role references and courtesy lines", () => {
    const claims: Claim[] = [
      { id: "c1", section: "letter", kind: "ROLE_REFERENCE", text: "I am applying for the Desktop Support Technician position at Synthetic Health.", supportingFactCodes: [] },
      { id: "c2", section: "letter", kind: "COURTESY", text: "Thank you for your time and consideration.", supportingFactCodes: [] },
    ];
    expect(validateClaims(claims, jctx).status).toBe("PASSED");
  });

  it("blocks experience smuggled into a role reference", () => {
    const claims: Claim[] = [
      { id: "c1", section: "letter", kind: "ROLE_REFERENCE", text: "As an experienced desktop support professional, I am applying to Synthetic Health.", supportingFactCodes: [] },
    ];
    const r = validateClaims(claims, jctx);
    expect(r.status).toBe("BLOCKED");
    expect(r.violations.map((v) => v.rule)).toContain("ASSERTION_IN_REFERENCE");
  });

  it("passes a well-formed transferable bridge", () => {
    const claim: Claim = {
      id: "b1",
      section: "letter",
      kind: "BRIDGE",
      text: "My hardware troubleshooting experience is relevant to the desktop support work in this role.",
      supportingFactCodes: ["FACT-001"],
      segments: [
        { role: "candidate", text: "My hardware troubleshooting experience" },
        { role: "connective", text: "is relevant to" },
        { role: "target", text: "the desktop support work in this role." },
      ],
    };
    expect(validateClaims([claim], jctx).status).toBe("PASSED");
  });

  it("blocks a bridge that claims the target as experience", () => {
    const claim: Claim = {
      id: "b2",
      section: "letter",
      kind: "BRIDGE",
      text: "My desktop support experience is relevant to the desktop support work in this role.",
      supportingFactCodes: ["FACT-001"],
      segments: [
        { role: "candidate", text: "My desktop support experience" },
        { role: "connective", text: "is relevant to" },
        { role: "target", text: "the desktop support work in this role." },
      ],
    };
    expect(validateClaims([claim], jctx).status).toBe("BLOCKED");
  });

  it("blocks unapproved connectives and segment/text mismatches", () => {
    const bad: Claim = {
      id: "b3",
      section: "letter",
      kind: "BRIDGE",
      text: "My hardware troubleshooting experience proves mastery of the desktop support work in this role.",
      supportingFactCodes: ["FACT-001"],
      segments: [
        { role: "candidate", text: "My hardware troubleshooting experience" },
        { role: "connective", text: "proves mastery of" },
        { role: "target", text: "the desktop support work in this role." },
      ],
    };
    expect(validateClaims([bad], jctx).status).toBe("BLOCKED");
    const hidden: Claim = { ...bad, id: "b4", text: "I am a desktop support expert.", segments: bad.segments!.map((s) => (s.role === "connective" ? { ...s, text: "is relevant to" } : s)) };
    expect(validateClaims([hidden], jctx).status).toBe("BLOCKED");
  });

  it("passes an honest gap statement", () => {
    const claim: Claim = {
      id: "g1",
      section: "interview",
      kind: "HONEST_GAP",
      text: "I haven't used SCCM professionally yet.",
      supportingFactCodes: [],
      segments: [
        { role: "connective", text: "I haven't used" },
        { role: "target", text: "SCCM" },
        { role: "connective", text: "professionally yet." },
      ],
    };
    expect(validateClaims([claim], jctx).status).toBe("PASSED");
  });
});

describe("report shape", () => {
  it("reports provenance for passed claims", () => {
    const r = validateClaims(
      [{ id: "s1", section: "competencies", kind: "SKILL", text: "Hardware troubleshooting", supportingFactCodes: ["FACT-001"] }],
      ctx,
    );
    expect(r.status).toBe("PASSED");
    expect(r.claims.s1.licensedBy["hardware-troubleshooting"]).toEqual(["FACT-001"]);
  });
});
