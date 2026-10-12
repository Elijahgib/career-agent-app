// Truth Gate regression suite for the ten known failure modes (A–J).
// Each block proves (1) the overstated claim is BLOCKED with the offending
// phrase named, and (2) the truthful claim from the same evidence PASSES.

import { describe, expect, it } from "vitest";
import { check, ctxOf, fact, phrases, rules } from "./helpers";

const repair = fact(
  "FACT-001",
  "Diagnosed and repaired POS systems, printers, scanners and payment peripherals at retail store locations.",
  {
    allowedWording: ["hardware troubleshooting", "peripheral troubleshooting", "printer support", "hardware diagnosis", "parts replacement"],
    prohibitedExpansions: ["enterprise desktop support", "PC imaging", "SCCM", "Intune", "inventory management", "refurbishment", "warranty administration"],
  },
);

describe("A. Hardware field repair ≠ enterprise desktop administration", () => {
  const ctx = ctxOf(repair);

  it("blocks 'enterprise desktop support'", () => {
    const r = check(ctx, "Provided enterprise desktop support for retail store locations.", ["FACT-001"]);
    expect(r.status).toBe("BLOCKED");
    expect(phrases(r).some((p) => p.includes("enterprise desktop support"))).toBe(true);
  });

  it("blocks 'desktop administration' and 'endpoint management'", () => {
    expect(check(ctx, "Handled desktop administration for store PCs.", ["FACT-001"]).status).toBe("BLOCKED");
    expect(check(ctx, "Performed endpoint management for POS systems.", ["FACT-001"]).status).toBe("BLOCKED");
  });

  it("blocks an unearned 'desktop support technician' title", () => {
    const r = check(ctx, "Experienced desktop support technician.", ["FACT-001"], { section: "summary", kind: "SUMMARY" });
    expect(r.status).toBe("BLOCKED");
    expect(rules(r)).toContain("UNSUPPORTED_TITLE");
  });

  it("blocks plain 'desktop support' but offers a transferable hint", () => {
    const r = check(ctx, "Provided desktop support at store locations.", ["FACT-001"]);
    expect(r.status).toBe("BLOCKED");
    const v = r.violations.find((x) => x.phrase.toLowerCase() === "desktop support");
    expect(v?.hint).toMatch(/Transferable, not experience/);
  });

  it("passes the canonical fact and supported synonyms", () => {
    expect(check(ctx, "Diagnosed and repaired POS systems, printers, scanners and payment peripherals at retail store locations.", ["FACT-001"]).status).toBe("PASSED");
    expect(check(ctx, "Hardware troubleshooting", ["FACT-001"], { section: "competencies", kind: "SKILL" }).status).toBe("PASSED");
    expect(check(ctx, "Troubleshoots printers and peripherals", ["FACT-001"]).status).toBe("PASSED");
  });
});

describe("B. Hardware setup ≠ formal PC imaging", () => {
  const setup = fact("FACT-002", "Installed and configured replacement POS terminals and receipt printers during store remodels.", {
    allowedWording: ["hardware setup", "device setup", "hardware installation"],
    prohibitedExpansions: ["PC imaging", "OS deployment"],
  });
  const ctx = ctxOf(setup);

  it("blocks imaging language", () => {
    for (const text of ["Imaged and deployed POS terminals during store remodels.", "Performed PC imaging and OS deployment.", "Reimaged workstations with MDT."]) {
      const r = check(ctx, text, ["FACT-002"]);
      expect(r.status, text).toBe("BLOCKED");
    }
  });

  it("passes truthful setup wording", () => {
    expect(check(ctx, "Installed and configured replacement POS terminals and receipt printers during store remodels.", ["FACT-002"]).status).toBe("PASSED");
    expect(check(ctx, "Hardware setup & installation", ["FACT-002"], { section: "competencies", kind: "SKILL" }).status).toBe("PASSED");
  });
});

describe("C. Using Microsoft Office ≠ Microsoft 365 administration/support", () => {
  const office = fact("FACT-010", "Used Microsoft Office (Word, Excel, Outlook) to complete service reports and schedules.", {
    prohibitedExpansions: ["Microsoft 365 administration", "Office 365 support", "Exchange administration"],
  });
  const ctx = ctxOf(office);

  it("blocks Microsoft 365 claims", () => {
    for (const text of ["Supported Microsoft 365 users.", "Microsoft 365 administration", "Provided Office 365 support to staff.", "Managed Exchange Online mailboxes."]) {
      expect(check(ctx, text, ["FACT-010"]).status, text).toBe("BLOCKED");
    }
  });

  it("passes truthful Office usage", () => {
    expect(check(ctx, "Used Microsoft Office (Word, Excel, Outlook) to complete service reports and schedules.", ["FACT-010"]).status).toBe("PASSED");
    expect(check(ctx, "Microsoft Office", ["FACT-010"], { section: "competencies", kind: "SKILL" }).status).toBe("PASSED");
  });
});

describe("D. Customer communication ≠ phone/chat/email support unless verified", () => {
  const comms = fact("FACT-003", "Communicated repair status and next steps to store managers and staff on site.", {
    allowedWording: ["customer communication", "explained repairs"],
  });
  const phoneUnverified = fact("FACT-013", "Provided phone support to store staff during after-hours POS outages.", { verificationStatus: "UNVERIFIED" });
  const ctx = ctxOf(comms, phoneUnverified);

  it("blocks invented support channels", () => {
    expect(check(ctx, "Provided phone support to store managers.", ["FACT-003"]).status).toBe("BLOCKED");
    expect(check(ctx, "Handled live chat support for store staff.", ["FACT-003"]).status).toBe("BLOCKED");
    expect(check(ctx, "Responded to store requests via email.", ["FACT-003"]).status).toBe("BLOCKED");
    expect(check(ctx, "Answered inbound calls from store managers.", ["FACT-003"]).status).toBe("BLOCKED");
  });

  it("blocks claims that rely on UNVERIFIED evidence", () => {
    const r = check(ctx, "Provided phone support to store staff during after-hours POS outages.", ["FACT-013"]);
    expect(r.status).toBe("BLOCKED");
    expect(rules(r)).toContain("UNVERIFIED_EVIDENCE");
  });

  it("passes truthful communication wording", () => {
    expect(check(ctx, "Communicated repair status and next steps to store managers and staff on site.", ["FACT-003"]).status).toBe("PASSED");
    expect(check(ctx, "Customer communication", ["FACT-003"], { section: "competencies", kind: "SKILL" }).status).toBe("PASSED");
  });
});

describe("E. Repairing/replacing equipment ≠ refurbishment", () => {
  const ctx = ctxOf(repair);
  it("blocks refurbishment claims", () => {
    for (const text of ["Refurbished POS equipment for redeployment.", "Performed refurbishment of printers and scanners.", "Processed warranty claims for failed scanners."]) {
      expect(check(ctx, text, ["FACT-001"]).status, text).toBe("BLOCKED");
    }
  });
  it("passes repair wording", () => {
    expect(check(ctx, "Repaired POS systems and replaced failed parts.", ["FACT-001"]).status).toBe("PASSED");
  });
});

describe("F. Asset/service records ≠ formal inventory ownership", () => {
  const records = fact("FACT-004", "Logged parts used, serial numbers and repair notes in service records for each visit.", {
    allowedWording: ["service records", "repair documentation", "asset tracking"],
    prohibitedExpansions: ["inventory management", "IT asset management", "asset lifecycle management"],
  });
  const ctx = ctxOf(records);
  it("blocks inventory ownership claims", () => {
    for (const text of ["Managed inventory of POS parts.", "Owned IT asset management for store hardware.", "Handled asset lifecycle management.", "Responsible for inventory control."]) {
      expect(check(ctx, text, ["FACT-004"]).status, text).toBe("BLOCKED");
    }
  });
  it("passes service-record wording", () => {
    expect(check(ctx, "Logged parts used, serial numbers and repair notes in service records for each visit.", ["FACT-004"]).status).toBe("PASSED");
    expect(check(ctx, "Asset tracking", ["FACT-004"], { section: "competencies", kind: "SKILL" }).status).toBe("PASSED");
  });
});

describe("G. Data/low-voltage cabling ≠ voice cabling", () => {
  const cabling = fact("FACT-005", "Terminated and tested Cat6 data cabling for POS network drops.", {
    allowedWording: ["low-voltage cabling", "data cabling", "cable termination"],
    prohibitedExpansions: ["voice cabling", "telecom cabling"],
  });
  const ctx = ctxOf(cabling);
  it("blocks voice cabling", () => {
    expect(check(ctx, "Installed voice and data cabling for store networks.", ["FACT-005"]).status).toBe("BLOCKED");
    expect(check(ctx, "Terminated voice cabling and 66 blocks.", ["FACT-005"]).status).toBe("BLOCKED");
    expect(check(ctx, "Telecom cabling", ["FACT-005"], { section: "competencies", kind: "SKILL" }).status).toBe("BLOCKED");
  });
  it("passes data cabling wording", () => {
    expect(check(ctx, "Terminated and tested Cat6 data cabling for POS network drops.", ["FACT-005"]).status).toBe("PASSED");
    expect(check(ctx, "Low-voltage cabling", ["FACT-005"], { section: "competencies", kind: "SKILL" }).status).toBe("PASSED");
  });
});

describe("H. Networking fundamentals ≠ network engineering", () => {
  const connectivity = fact("FACT-006", "Troubleshot store modem and router connectivity issues with the internet service provider.", {
    allowedWording: ["network connectivity troubleshooting"],
    prohibitedExpansions: ["network administration", "routing and switching"],
  });
  const ccnaStudy = fact("FACT-020", "Studying for the Cisco CCNA exam using Packet Tracer labs.", {
    category: "LEARNING",
    experienceType: "LEARNING",
    positionId: null,
    conceptIds: ["ccna"],
  });
  const ctx = ctxOf(connectivity, ccnaStudy);
  it("blocks network engineering claims", () => {
    for (const text of ["Configured routers and switches for store networks.", "Performed network engineering for retail sites.", "Routing and switching", "Designed store network architecture."]) {
      expect(check(ctx, text, ["FACT-006"]).status, text).toBe("BLOCKED");
    }
  });
  it("blocks claiming a CCNA that is only being studied for", () => {
    const r = check(ctx, "CCNA certified", ["FACT-020"], { section: "certifications", kind: "CREDENTIAL" });
    expect(r.status).toBe("BLOCKED");
    expect(rules(r)).toContain("CERTIFICATION_NOT_EARNED");
  });
  it("passes truthful connectivity and study wording", () => {
    expect(check(ctx, "Troubleshot store modem and router connectivity issues with the internet service provider.", ["FACT-006"]).status).toBe("PASSED");
    expect(check(ctx, "Studying for the Cisco CCNA exam using Packet Tracer labs.", ["FACT-020"], { section: "projects", kind: "LEARNING" }).status).toBe("PASSED");
  });
});

describe("I. Working with Windows-based devices ≠ Windows administration", () => {
  const windows = fact("FACT-007", "Supported Windows-based POS workstations and back-office PCs at 30 store locations.", {
    prohibitedExpansions: ["Windows administration", "Windows Server", "Active Directory", "Group Policy"],
  });
  const ctx = ctxOf(windows);
  it("blocks Windows administration claims", () => {
    for (const text of ["Administered Windows workstations across 30 stores.", "Windows Server administration", "Managed Group Policy for store PCs.", "Maintained Active Directory accounts."]) {
      expect(check(ctx, text, ["FACT-007"]).status, text).toBe("BLOCKED");
    }
  });
  it("passes Windows device support", () => {
    expect(check(ctx, "Supported Windows-based POS workstations and back-office PCs at 30 store locations.", ["FACT-007"]).status).toBe("PASSED");
    expect(check(ctx, "Windows", ["FACT-007"], { section: "competencies", kind: "SKILL" }).status).toBe("PASSED");
  });
});

describe("J. Learning a technology ≠ professional experience using it", () => {
  const lab = fact("FACT-012", "Built a home lab with Windows Server evaluation to practice Active Directory user and group management.", {
    category: "PROJECT",
    experienceType: "LEARNING",
    positionId: null,
    conceptIds: ["windows-server", "active-directory"],
  });
  const aplus = fact("FACT-011", "Studying for CompTIA A+ certification (Core 1 exam passed, Core 2 in progress).", {
    category: "LEARNING",
    experienceType: "LEARNING",
    positionId: null,
    conceptIds: ["comptia-a-plus"],
  });
  const ctx = ctxOf(lab, aplus);

  it("blocks lab work presented as job experience", () => {
    const r = check(ctx, "Managed Active Directory users and groups.", ["FACT-012"], { section: "experience" });
    expect(r.status).toBe("BLOCKED");
    expect(rules(r)).toContain("LEARNING_AS_EXPERIENCE");
  });
  it("blocks lab-only skills in the competencies list", () => {
    expect(check(ctx, "Active Directory", ["FACT-012"], { section: "competencies", kind: "SKILL" }).status).toBe("BLOCKED");
  });
  it("blocks professional-experience language in a summary", () => {
    expect(check(ctx, "Experienced with Active Directory and Windows Server.", ["FACT-012"], { section: "summary", kind: "SUMMARY" }).status).toBe("BLOCKED");
  });
  it("blocks an earned-certification claim for an exam still in progress", () => {
    expect(check(ctx, "CompTIA A+ certified", ["FACT-011"], { section: "certifications", kind: "CREDENTIAL" }).status).toBe("BLOCKED");
  });
  it("passes learning presented as learning", () => {
    expect(check(ctx, "Built a home lab with Windows Server evaluation to practice Active Directory user and group management.", ["FACT-012"], { section: "projects", kind: "LEARNING" }).status).toBe("PASSED");
    expect(check(ctx, "Studying for CompTIA A+ certification (Core 1 exam passed, Core 2 in progress).", ["FACT-011"], { section: "projects", kind: "LEARNING" }).status).toBe("PASSED");
    expect(check(ctx, "Currently studying Active Directory in a home lab.", ["FACT-012"], { section: "summary", kind: "SUMMARY" }).status).toBe("PASSED");
  });
});
