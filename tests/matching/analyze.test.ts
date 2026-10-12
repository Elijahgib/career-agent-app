import { describe, expect, it } from "vitest";
import { analyzeJob, parseSalaryText, detectRemote } from "@/lib/jobs/analyze";

const base = { title: "IT Support Technician", employmentType: "UNKNOWN" as const, remoteType: "UNKNOWN" as const, salaryMin: null, salaryMax: null, salaryPeriod: null };

describe("job analyzer", () => {
  it("separates required, preferred and responsibility items by heading", () => {
    const a = analyzeJob({
      ...base,
      description: `Responsibilities
- Troubleshoot printers
Requirements
- 2+ years of help desk experience
Preferred Qualifications
- CompTIA A+`,
    });
    const by = Object.fromEntries(a.requirements.map((r) => [r.conceptId, r.importance]));
    expect(by["printers"]).toBe("RESPONSIBILITY");
    expect(by["help-desk-support"]).toBe("REQUIRED");
    expect(by["comptia-a-plus"]).toBe("PREFERRED");
    expect(a.minYears?.years).toBe(2);
  });

  it("does not mistake a requirement sentence for a heading", () => {
    const a = analyzeJob({ ...base, description: "Requirements\nExperience with SCCM or Intune\nSkills\n- PowerShell" });
    expect(a.requirements.map((r) => r.conceptId)).toEqual(expect.arrayContaining(["sccm", "intune", "powershell"]));
  });

  it("groups 'X or Y' alternatives", () => {
    const a = analyzeJob({ ...base, description: "Requirements\n- Experience with SCCM or Intune" });
    const sccm = a.requirements.find((r) => r.conceptId === "sccm");
    const intune = a.requirements.find((r) => r.conceptId === "intune");
    expect(sccm?.group).toBeDefined();
    expect(sccm?.group).toBe(intune?.group);
  });

  it("downgrades certifications that accept equivalent experience", () => {
    const a = analyzeJob({ ...base, description: "Requirements\n- CompTIA A+ or equivalent experience" });
    expect(a.requirements.find((r) => r.conceptId === "comptia-a-plus")?.importance).toBe("PREFERRED");
  });

  it("parses degree requirements and equivalency", () => {
    expect(analyzeJob({ ...base, description: "Requirements\n- Bachelor's degree in IT required" }).degree).toMatchObject({ level: "BACHELOR", equivalencyAllowed: false });
    expect(analyzeJob({ ...base, description: "Requirements\n- Bachelor's degree or equivalent experience" }).degree).toMatchObject({ level: "BACHELOR", equivalencyAllowed: true });
  });

  it("distinguishes an existing clearance from ability to obtain one", () => {
    expect(analyzeJob({ ...base, description: "Requirements\n- Active Secret clearance required" }).clearance).toMatchObject({ level: "SECRET", mustHaveActive: true });
    expect(analyzeJob({ ...base, description: "Requirements\n- Ability to obtain a Secret clearance" }).clearance).toMatchObject({ mustHaveActive: false });
  });

  it("lists required lines it cannot interpret instead of guessing", () => {
    const a = analyzeJob({ ...base, description: "Requirements\n- Must be able to lift 50 lbs" });
    expect(a.uninterpretedRequirements).toContain("Must be able to lift 50 lbs");
  });

  it("parses salary ranges in several formats", () => {
    expect(parseSalaryText("$48,000 - $56,000 per year")).toMatchObject({ min: 48000, max: 56000, period: "YEAR", annualMax: 56000 });
    expect(parseSalaryText("$22 - $26 per hour")).toMatchObject({ min: 22, max: 26, period: "HOUR", annualMax: 54080 });
    expect(parseSalaryText("$72k - $88k")).toMatchObject({ min: 72000, max: 88000, period: "YEAR" });
    expect(parseSalaryText("$21/hr")).toMatchObject({ min: 21, max: 21, period: "HOUR" });
    expect(parseSalaryText("Competitive pay").source).toBe("NONE");
  });

  it("detects remote, hybrid and on-site", () => {
    expect(detectRemote("Remote (US only). Work from anywhere.").value).toBe("REMOTE");
    expect(detectRemote("Remote (US only)").restriction).toBe("US only");
    expect(detectRemote("Hybrid: 3 days in office").value).toBe("HYBRID");
    expect(detectRemote("This role is on-site in Austin").value).toBe("ONSITE");
  });

  it("detects seniority from the title", () => {
    expect(analyzeJob({ ...base, title: "Senior Network Engineer", description: "" }).seniority).toBe("SENIOR");
    expect(analyzeJob({ ...base, title: "IT Manager", description: "" }).seniority).toBe("LEAD");
    expect(analyzeJob({ ...base, title: "Junior Help Desk Analyst", description: "" }).seniority).toBe("ENTRY");
  });
});
