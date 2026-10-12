// Relationship semantics: FACT + RELATIONSHIP + CONTEXT + ALLOWED WORDING.
//
// Keyword presence is not evidence. Each case below runs twice: with the
// relationship inferred from the canonical text, and with the relationship
// set explicitly by the user. A weaker relationship must never authorize a
// stronger resume claim, and truthful restatements must still pass.

import { describe, expect, it } from "vitest";
import type { LedgerFact, Relation } from "@/lib/domain/types";
import { DEMO_PERSONAS, personaSnapshot } from "@/lib/demo/personas";
import { DEMO_JOBS, demoJobRecord } from "@/lib/demo/jobs";
import { generateCoverLetter } from "@/lib/documents/cover-letter";
import { factRelationsFor, licenseForFact } from "@/lib/evidence/ledger";
import { computeFactRelations, readClaim, satisfies } from "@/lib/evidence/relations";
import { analyzeJob } from "@/lib/jobs/analyze";
import { matchJob } from "@/lib/matching/engine";
import type { ClaimKind, ClaimSection } from "@/lib/truth-gate/types";
import { check, ctxOf, fact, rules } from "./helpers";

const PLACEMENTS: { label: string; section: ClaimSection; kind: ClaimKind }[] = [
  { label: "experience bullet", section: "experience", kind: "EXPERIENCE" },
  { label: "skills line", section: "competencies", kind: "SKILL" },
  { label: "summary", section: "summary", kind: "SUMMARY" },
  { label: "cover letter", section: "letter", kind: "EXPERIENCE" },
];

interface Case {
  name: string;
  evidence: string;
  explicit: Relation[];
  mustFail: string[];
  mustPass: string[];
  extra?: Partial<LedgerFact>;
}

const MUST_FAIL: Case[] = [
  {
    name: "Escalated Active Directory issues",
    evidence: "Escalated Active Directory account issues to Tier 2.",
    explicit: ["ESCALATED_TO"],
    mustFail: [
      "Active Directory support",
      "Provided Active Directory support",
      "Supported Active Directory users",
      "Active Directory administration",
      "Administered Active Directory",
      "Managed user accounts in Active Directory",
      "Managed Active Directory user accounts",
      "Experience with Active Directory",
      "Active Directory",
      "Troubleshot Active Directory account issues",
      "Resolved Active Directory account issues",
    ],
    mustPass: ["Escalated Active Directory account issues to Tier 2", "Escalated Active Directory account issues"],
  },
  {
    name: "Worked alongside the networking team",
    evidence: "Worked alongside the networking team.",
    explicit: ["WORKED_ALONGSIDE"],
    mustFail: [
      "Network administration",
      "Network engineering",
      "Administered the network",
      "Networking experience",
      "Configured network switches",
      "Experience with networking",
      "Supported the network",
    ],
    mustPass: ["Worked alongside the networking team"],
  },
  {
    name: "Studied ServiceNow ticket workflows",
    evidence: "Studied ServiceNow ticket workflows.",
    explicit: ["STUDIED"],
    mustFail: [
      "ServiceNow experience",
      "Experience with ServiceNow",
      "Administered ServiceNow",
      "ServiceNow administration",
      "Used ServiceNow to manage tickets",
      "Managed tickets in ServiceNow",
      "ServiceNow",
      "Configured ServiceNow workflows",
    ],
    mustPass: ["Studied ServiceNow ticket workflows"],
  },
  {
    name: "Used Outlook as an email client",
    evidence: "Used Outlook as an email client.",
    explicit: ["USED"],
    mustFail: [
      "Outlook troubleshooting",
      "Troubleshot Outlook",
      "Microsoft 365 support",
      "Exchange administration",
      "Supported Outlook users",
      "Configured Outlook for users",
      "Outlook administration",
    ],
    mustPass: ["Used Outlook as an email client", "Used Outlook"],
  },
  {
    name: "Observed PC imaging",
    evidence: "Observed PC imaging.",
    explicit: ["OBSERVED"],
    mustFail: ["Imaged computers", "PC imaging", "PC deployment experience", "Performed PC imaging", "Deployed PCs", "Experience with PC imaging", "Reimaged laptops"],
    mustPass: ["Observed PC imaging"],
  },
  {
    name: "Escalated printer server issues",
    evidence: "Escalated printer server issues.",
    explicit: ["ESCALATED_TO"],
    mustFail: [
      "Print server administration",
      "Administered print servers",
      "Supported print servers",
      "Managed print queues",
      "Print server troubleshooting",
      "Troubleshot printer server issues",
    ],
    mustPass: ["Escalated printer server issues"],
  },
];

const REVERSE: Case[] = [
  {
    name: "Diagnosed and repaired receipt printers",
    evidence: "Diagnosed and repaired receipt printers in the field.",
    explicit: ["TROUBLESHOT", "REPAIRED"],
    mustPass: [
      "Printer troubleshooting",
      "Printer hardware support",
      "Peripheral troubleshooting",
      "Troubleshot receipt printers",
      "Repaired receipt printers",
      "Diagnosed and repaired receipt printers in the field",
      "Printer repair",
    ],
    mustFail: ["Print server administration", "Enterprise printer management", "Managed print services", "Administered printers"],
  },
  {
    name: "Troubleshot routers, modems and wireless connectivity",
    evidence: "Troubleshot routers, modems, and wireless connectivity for customers.",
    explicit: ["TROUBLESHOT"],
    mustPass: [
      "Router/modem troubleshooting",
      "Router and modem troubleshooting",
      "Connectivity troubleshooting",
      "Wireless troubleshooting",
      "Troubleshot wireless connectivity for customers",
      "Troubleshot routers and modems",
    ],
    mustFail: ["Network engineering", "Switch administration", "Firewall administration", "Configured routers", "Administered wireless networks", "Managed network switches"],
  },
];

function run(c: Case, mode: "inferred" | "explicit") {
  const f = fact("FACT-001", c.evidence, { relations: mode === "explicit" ? c.explicit : [], ...c.extra });
  const ctx = ctxOf(f);
  describe(`${c.name} (${mode} relationship)`, () => {
    for (const claim of c.mustFail) {
      it(`blocks “${claim}” everywhere`, () => {
        for (const p of PLACEMENTS) {
          const r = check(ctx, claim, ["FACT-001"], { section: p.section, kind: p.kind });
          expect(r.status, `${claim} as ${p.label}`).toBe("BLOCKED");
        }
      });
    }
    for (const claim of c.mustPass) {
      it(`passes “${claim}”`, () => {
        for (const p of PLACEMENTS.slice(0, 2)) {
          const r = check(ctx, claim, ["FACT-001"], { section: p.section, kind: p.kind });
          expect(r.violations, `${claim} as ${p.label}`).toEqual([]);
        }
      });
    }
  });
}

describe("Relationship semantics — weaker evidence never authorizes a stronger claim", () => {
  for (const c of MUST_FAIL) {
    run(c, "inferred");
    run(c, "explicit");
  }
});

describe("Relationship semantics — reverse cases (hands-on evidence authorizes what it shows, no more)", () => {
  for (const c of REVERSE) {
    run(c, "inferred");
    run(c, "explicit");
  }
});

describe("RELATION_EXCEEDS_EVIDENCE explains the relationship", () => {
  const ctx = ctxOf(fact("FACT-001", "Escalated Active Directory account issues to Tier 2."));

  it("names the claimed and the evidenced relationship", () => {
    const r = check(ctx, "Provided Active Directory support for store staff.", ["FACT-001"]);
    const v = r.violations.find((x) => x.rule === "RELATION_EXCEEDS_EVIDENCE");
    expect(v).toBeDefined();
    expect(v!.conceptId).toBe("active-directory");
    expect(v!.message).toMatch(/supported Active Directory/);
    expect(v!.message).toMatch(/FACT-001: escalated/);
    expect(v!.message).toMatch(/weaker relationship never authorizes a stronger claim/);
  });

  it("does not offer escalation evidence as transferable experience", () => {
    const r = check(ctx, "Provided desktop support.", ["FACT-001"]);
    expect(r.status).toBe("BLOCKED");
    for (const v of r.violations) expect(v.hint ?? "").not.toMatch(/Active Directory evidence/);
  });
});

describe("Additional relationship cases", () => {
  it("‘worked alongside the network engineering team’ never authorizes network engineering", () => {
    const ctx = ctxOf(fact("FACT-001", "Worked alongside the network engineering team during store openings."));
    for (const claim of ["Network engineering", "Performed network engineering during store openings", "Network engineering experience"]) {
      expect(check(ctx, claim, ["FACT-001"]).status, claim).toBe("BLOCKED");
    }
    expect(rules(check(ctx, "Network engineering", ["FACT-001"], { section: "competencies", kind: "SKILL" }))).toContain("RELATION_EXCEEDS_EVIDENCE");
    expect(check(ctx, "Worked alongside the network engineering team during store openings.", ["FACT-001"]).status).toBe("PASSED");
  });

  it("‘escalated issues to the help desk’ never authorizes help desk support", () => {
    const ctx = ctxOf(fact("FACT-001", "Escalated store technology issues to the help desk."));
    expect(check(ctx, "Provided help desk support", ["FACT-001"]).status).toBe("BLOCKED");
    expect(check(ctx, "Help desk support", ["FACT-001"], { section: "competencies", kind: "SKILL" }).status).toBe("BLOCKED");
    expect(check(ctx, "Escalated store technology issues to the help desk.", ["FACT-001"]).status).toBe("PASSED");
  });

  it("allowed wording cannot upgrade the relationship (‘Active Directory support’ on an escalation fact)", () => {
    const f = fact("FACT-001", "Escalated Active Directory account issues to Tier 2.", { allowedWording: ["Active Directory support", "Active Directory administration"] });
    const lic = licenseForFact(f);
    expect(lic.wordingIssues.map((w) => w.phrase)).toEqual(expect.arrayContaining(["Active Directory support", "Active Directory administration"]));
    const ctx = ctxOf(f);
    expect(check(ctx, "Active Directory support", ["FACT-001"], { section: "competencies", kind: "SKILL" }).status).toBe("BLOCKED");
    expect(check(ctx, "Provided Active Directory support", ["FACT-001"]).status).toBe("BLOCKED");
  });

  it("allowed wording within the relationship still works", () => {
    const f = fact("FACT-001", "Diagnosed and repaired receipt printers in the field.", { allowedWording: ["printer troubleshooting", "printer repair"] });
    expect(licenseForFact(f).wordingIssues).toEqual([]);
    expect(check(ctxOf(f), "Printer troubleshooting and printer repair", ["FACT-001"], { section: "competencies", kind: "SKILL" }).status).toBe("PASSED");
  });

  it("an explicit MENTIONED_ONLY relationship narrows hands-on text", () => {
    const f = fact("FACT-001", "Reset passwords in Active Directory for store staff.", { relations: ["MENTIONED_ONLY"] });
    expect([...factRelationsFor(f, "active-directory")]).toEqual(["MENTIONED_ONLY"]);
    const ctx = ctxOf(f);
    expect(check(ctx, "Supported Active Directory users", ["FACT-001"]).status).toBe("BLOCKED");
    expect(check(ctx, "Active Directory", ["FACT-001"], { section: "competencies", kind: "SKILL" }).status).toBe("BLOCKED");
    // The verified sentence itself can still be restated word for word.
    expect(check(ctx, "Reset passwords in Active Directory for store staff.", ["FACT-001"]).status).toBe("PASSED");
  });

  it("an explicit ESCALATED_TO relationship overrides a generic verb", () => {
    const f = fact("FACT-001", "Handled Active Directory account issues for store staff.", { relations: ["ESCALATED_TO"] });
    expect([...factRelationsFor(f, "active-directory")]).toEqual(["ESCALATED_TO"]);
    expect(check(ctxOf(f), "Active Directory support", ["FACT-001"], { section: "competencies", kind: "SKILL" }).status).toBe("BLOCKED");
  });

  it("an explicit stronger relationship cannot upgrade weaker text", () => {
    const f = fact("FACT-001", "Observed PC imaging.", { relations: ["ADMINISTERED"] });
    expect([...factRelationsFor(f, "pc-imaging")]).toEqual(["OBSERVED"]);
    expect(check(ctxOf(f), "Imaged computers", ["FACT-001"]).status).toBe("BLOCKED");
  });

  it("an explicit relationship narrows a strong one (administered → supported only)", () => {
    const f = fact("FACT-001", "Administered Active Directory user accounts for 120 staff.", { relations: ["SUPPORTED"] });
    const ctx = ctxOf(f);
    expect(check(ctx, "Supported Active Directory users", ["FACT-001"]).status).toBe("PASSED");
    expect(check(ctx, "Active Directory administration", ["FACT-001"], { section: "competencies", kind: "SKILL" }).status).toBe("BLOCKED");
  });

  it("strong evidence still authorizes weaker claims", () => {
    const ctx = ctxOf(fact("FACT-001", "Administered Active Directory user accounts and Group Policy for 120 staff."));
    for (const claim of ["Active Directory administration", "Active Directory support", "Supported Active Directory users", "Active Directory", "Experience with Active Directory"]) {
      expect(check(ctx, claim, ["FACT-001"], { section: "competencies", kind: "SKILL" }).violations, claim).toEqual([]);
    }
  });

  it("verbatim restatement of a weak fact passes, but stronger words added to it do not", () => {
    const ctx = ctxOf(fact("FACT-001", "Escalated Active Directory account issues to Tier 2."));
    expect(check(ctx, "Escalated Active Directory account issues to Tier 2.", ["FACT-001"]).status).toBe("PASSED");
    expect(check(ctx, "Escalated Active Directory account issues to Tier 2 and administered Active Directory.", ["FACT-001"]).status).toBe("BLOCKED");
  });

  it("‘assisted’ evidence authorizes only assisting", () => {
    const ctx = ctxOf(fact("FACT-001", "Assisted the desktop team with deploying 40 laptops using Windows Autopilot."));
    expect(check(ctx, "Deployed 40 laptops using Windows Autopilot", ["FACT-001"]).status).toBe("BLOCKED");
    expect(check(ctx, "Windows Autopilot deployment", ["FACT-001"], { section: "competencies", kind: "SKILL" }).status).toBe("BLOCKED");
    expect(check(ctx, "Assisted with deploying 40 laptops using Windows Autopilot", ["FACT-001"]).status).toBe("PASSED");
  });

  it("unattached strong verbs need a fact that shows them", () => {
    const ctx = ctxOf(fact("FACT-001", "Answered customer questions about store hours."));
    const r = check(ctx, "Configured and administered store systems for customers.", ["FACT-001"]);
    expect(r.status).toBe("BLOCKED");
  });

  it("lab context: a home-lab claim needs lab evidence, and lab evidence never becomes work", () => {
    const lab = fact("FACT-002", "Built a home lab with Windows Server and Active Directory.", { category: "PROJECT", experienceType: "LEARNING", positionId: null });
    const ctx = ctxOf(lab);
    expect(check(ctx, "Configured Active Directory in a home lab", ["FACT-002"], { section: "projects", kind: "LEARNING" }).status).toBe("PASSED");
    expect(check(ctx, "Administered Active Directory", ["FACT-002"], { section: "projects", kind: "LEARNING" }).status).toBe("BLOCKED");
    expect(check(ctx, "Administered Active Directory", ["FACT-002"]).status).toBe("BLOCKED");
  });
});

describe("Evidence relation inference", () => {
  const rels = (text: string, cid: string, extra: Partial<LedgerFact> = {}) => [...(computeFactRelations(fact("F", text, extra)).byConcept.get(cid) ?? [])].sort();

  it("reads the governing relationship, not the keyword", () => {
    expect(rels("Escalated Active Directory account issues to Tier 2.", "active-directory")).toEqual(["ESCALATED_TO"]);
    expect(rels("Studied ServiceNow ticket workflows.", "servicenow")).toEqual(["STUDIED"]);
    expect(rels("Used Outlook as an email client.", "microsoft-office")).toEqual(["USED"]);
    expect(rels("Observed PC imaging.", "pc-imaging")).toEqual(["OBSERVED"]);
    expect(rels("Escalated printer server issues.", "print-server")).toEqual(["ESCALATED_TO"]);
    expect(rels("Diagnosed and repaired receipt printers in the field.", "printers")).toEqual(["REPAIRED", "TROUBLESHOT"]);
    expect(rels("Troubleshot routers, modems, and wireless connectivity for customers.", "routers-modems")).toEqual(["TROUBLESHOT"]);
    expect(rels("Troubleshot routers, modems, and wireless connectivity for customers.", "wireless")).toEqual(["TROUBLESHOT"]);
  });

  it("implied concepts inherit the relationship (observing imaging is not deploying devices)", () => {
    expect(rels("Observed PC imaging.", "device-deployment")).toEqual(["OBSERVED"]);
    expect(rels("Diagnosed and repaired receipt printers in the field.", "peripherals")).toEqual(["REPAIRED", "TROUBLESHOT"]);
  });

  it("a weak cue anywhere in the clause governs the evidence (conservative reading)", () => {
    expect(rels("Shadowed technicians while they reimaged and deployed laptops.", "pc-imaging")).toEqual(["OBSERVED"]);
    expect(rels("Watched senior techs configure Active Directory.", "active-directory")).toEqual(["OBSERVED"]);
  });

  it("learning facts are capped at study / lab relationships", () => {
    expect(rels("Configured Active Directory users and groups.", "active-directory", { experienceType: "LEARNING", category: "PROJECT" })).toEqual(["LAB_ONLY"]);
  });

  it("every relation satisfies itself and only weaker hands-on relations", () => {
    expect(satisfies("REPAIRED", "TROUBLESHOT")).toBe(true);
    expect(satisfies("TROUBLESHOT", "REPAIRED")).toBe(false);
    expect(satisfies("ESCALATED_TO", "SUPPORTED")).toBe(false);
    expect(satisfies("WORKED_ALONGSIDE", "USED")).toBe(false);
    expect(satisfies("USED", "TROUBLESHOT")).toBe(false);
    expect(satisfies("ADMINISTERED", "SUPPORTED")).toBe(true);
    expect(satisfies("STUDIED", "USED")).toBe(false);
    expect(satisfies("LAB_ONLY", "STUDIED")).toBe(true);
  });
});

describe("Claim relation reading", () => {
  const asserted = (text: string, cid: string) => readClaim(text).items.filter((i) => i.binding.conceptId === cid).flatMap((i) => i.asserted).sort();

  it("reads what the claim asserts", () => {
    expect(asserted("Provided Active Directory support", "active-directory")).toContain("SUPPORTED");
    expect(asserted("Active Directory administration", "active-directory")).toContain("ADMINISTERED");
    expect(asserted("Managed user accounts in Active Directory", "active-directory")).toContain("ADMINISTERED");
    expect(asserted("Outlook troubleshooting", "microsoft-office")).toContain("TROUBLESHOT");
    expect(asserted("Escalated printer server issues", "print-server")).toEqual(["ESCALATED_TO"]);
  });

  it("hands-on verbs in a home lab are lab relationships", () => {
    expect(asserted("Configured Active Directory in a home lab", "active-directory")).toEqual(["LAB_ONLY"]);
  });
});

describe("Matching: exposure is not a verified requirement", () => {
  it("classifies an escalation-only skill as EXPOSURE_ONLY", () => {
    const f = fact("FACT-001", "Escalated Active Directory account issues to Tier 2.");
    const snapshot = {
      profile: { id: "p", displayName: "Test", links: [], careerLevel: "EARLY" as const },
      preferences: {
        targetTitles: [], targetKeywords: [], salaryCurrency: "USD", remotePreference: "ANY" as const, acceptableLocations: [], willingToRelocate: false,
        employmentTypes: ["FULL_TIME" as const], excludedEmploymentTypes: [], excludedCompanies: [], excludedKeywords: [], securityClearance: "NONE" as const, hasDriversLicense: true,
      },
      positions: [{ id: "pos-a", employer: "Synthetic Retail Co", title: "Field Service Technician", startDate: "2022-01", endDate: null, verificationStatus: "VERIFIED" as const }],
      education: [],
      facts: [f],
    };
    const now = new Date("2026-10-01T00:00:00Z");
    const job = {
      id: "j", title: "IT Support Specialist", company: "Example Co", remoteType: "ONSITE" as const, employmentType: "FULL_TIME" as const, status: "ACTIVE" as const,
      description: "Requirements:\n- Experience with Active Directory (required)\n", firstSeenAt: now, lastSeenAt: now, fieldVerification: {},
    };
    const m = matchJob(snapshot, job, { analysis: analyzeJob(job), now });
    const ad = m.requirements.find((r) => r.conceptId === "active-directory");
    expect(ad?.status).toBe("EXPOSURE_ONLY");
    expect(ad?.factCodes).toEqual(["FACT-001"]);
    expect(m.counts.hardGaps).toBeGreaterThan(0);
  });
});

describe("Relationship plumbing", () => {
  it("the license cache never confuses two facts whose fields join to the same text", () => {
    const a = fact("FACT-009", "Used Outlook as an email client.", { allowedWording: ["Outlook administration|Used Outlook"] });
    const b = fact("FACT-009", "Used Outlook as an email client.", { allowedWording: ["Outlook administration", "Used Outlook"] });
    expect(licenseForFact(a)).not.toBe(licenseForFact(b));
    expect(licenseForFact(b).wordingIssues.map((w) => w.phrase)).toEqual(["Outlook administration"]);
  });

  it("exposure-only evidence does not count toward relevant years of experience", () => {
    const now = new Date("2026-10-01T00:00:00Z");
    const snapshot = {
      profile: { id: "p", displayName: "Test", links: [], careerLevel: "EARLY" as const },
      preferences: {
        targetTitles: [], targetKeywords: [], salaryCurrency: "USD", remotePreference: "ANY" as const, acceptableLocations: [], willingToRelocate: false,
        employmentTypes: ["FULL_TIME" as const], excludedEmploymentTypes: [], excludedCompanies: [], excludedKeywords: [], securityClearance: "NONE" as const, hasDriversLicense: true,
      },
      positions: [{ id: "pos-a", employer: "Synthetic Retail Co", title: "Sales Associate", startDate: "2020-01", endDate: null, verificationStatus: "VERIFIED" as const }],
      education: [],
      facts: [fact("FACT-001", "Escalated Active Directory account issues to Tier 2.")],
    };
    const job = {
      id: "j", title: "Systems Technician", company: "Example Co", remoteType: "ONSITE" as const, employmentType: "FULL_TIME" as const, status: "ACTIVE" as const,
      description: "Requirements:\n- 3+ years of experience with Active Directory (required)\n", firstSeenAt: now, lastSeenAt: now, fieldVerification: {},
    };
    const m = matchJob(snapshot, job, { analysis: analyzeJob(job), now });
    const exp = m.components.find((c) => c.key === "experience");
    expect(exp?.explanation).toMatch(/you have 0 years of relevant verified experience/);
  });

  it("the cover letter never puts exposure wording inside “experience with …”", () => {
    const now = new Date("2026-10-04T12:00:00Z");
    for (const p of DEMO_PERSONAS) {
      const s = personaSnapshot(p);
      for (const d of DEMO_JOBS) {
        const job = demoJobRecord(d, now);
        const letter = generateCoverLetter(s, job, { now });
        for (const c of letter.claims) {
          if (/experience with/.test(c.text)) expect(c.text, `${p.key} × ${job.title}`).not.toMatch(/assisted|observed|escalated|shadowed/i);
        }
      }
    }
  });
});

describe("Matching agrees with the gate", () => {
  const now = new Date("2026-10-01T00:00:00Z");
  const snapshotWith = (...facts: LedgerFact[]) => ({
    profile: { id: "p", displayName: "Test", links: [], careerLevel: "EARLY" as const },
    preferences: {
      targetTitles: [], targetKeywords: [], salaryCurrency: "USD", remotePreference: "ANY" as const, acceptableLocations: [], willingToRelocate: false,
      employmentTypes: ["FULL_TIME" as const], excludedEmploymentTypes: [], excludedCompanies: [], excludedKeywords: [], securityClearance: "NONE" as const, hasDriversLicense: true,
    },
    positions: [{ id: "pos-a", employer: "Synthetic Retail Co", title: "Sales Associate", startDate: "2022-01", endDate: null, verificationStatus: "VERIFIED" as const }],
    education: [],
    facts,
  });
  const jobFor = (line: string) => ({
    id: "j", title: "Endpoint Technician", company: "Example Co", remoteType: "ONSITE" as const, employmentType: "FULL_TIME" as const, status: "ACTIVE" as const,
    description: `Requirements:\n- ${line}\n`, firstSeenAt: now, lastSeenAt: now, fieldVerification: {},
  });

  it("using a tool is PARTIAL against a requirement to administer it", () => {
    const job = jobFor("Mobile device management administration (required)");
    const m = matchJob(snapshotWith(fact("FACT-001", "Used Intune to check device compliance.")), job, { analysis: analyzeJob(job), now });
    expect(m.requirements.find((r) => r.conceptId === "mdm")?.status).toBe("PARTIAL");
  });

  it("administering it is VERIFIED", () => {
    const job = jobFor("Mobile device management administration (required)");
    const m = matchJob(snapshotWith(fact("FACT-001", "Administered Intune device compliance policies for 200 laptops.")), job, { analysis: analyzeJob(job), now });
    expect(m.requirements.find((r) => r.conceptId === "mdm")?.status).toBe("VERIFIED");
  });
});

describe("Robustness", () => {
  it("handles very long or odd input without crashing", () => {
    expect(() => computeFactRelations(fact("F", "x; ".repeat(150000) + " repaired printers in a test lab"))).not.toThrow();
    for (const t of ["", "...", "🙂🙂🙂", "​​", "—;:,"]) expect(() => readClaim(t)).not.toThrow();
  });
});
