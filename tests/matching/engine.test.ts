import { describe, expect, it } from "vitest";
import { DEMO_JOBS, demoJobRecord } from "@/lib/demo/jobs";
import { JORDAN, SAM, personaSnapshot } from "@/lib/demo/personas";
import { matchJob } from "@/lib/matching/engine";
import type { CandidateSnapshot } from "@/lib/domain/types";

const now = new Date("2026-10-04T12:00:00Z");
const job = (key: string) => demoJobRecord(DEMO_JOBS.find((d) => d.key === key)!, now);
const jordan = personaSnapshot(JORDAN);
const sam = personaSnapshot(SAM);

describe("tiers", () => {
  it("rates a role matching verified experience STRONG", () => {
    const r = matchJob(jordan, job("proseware-field"), { now });
    expect(r.tier).toBe("STRONG");
    expect(r.counts.hardGaps).toBe(0);
  });

  it("never rates a role STRONG on transferable experience alone", () => {
    const r = matchJob(jordan, job("woodgrove-itsupport"), { now });
    expect(r.tier).not.toBe("STRONG");
    expect(r.tier).not.toBe("GOOD");
  });

  it("explains every tier with named components", () => {
    const r = matchJob(jordan, job("contoso-desktop"), { now });
    expect(r.components.map((c) => c.key)).toEqual(["verifiedSkills", "transferableSkills", "experience", "education", "location", "compensation", "freshness", "preferences"]);
    for (const c of r.components) expect(c.explanation.length).toBeGreaterThan(10);
    expect(r.reasons.length).toBeGreaterThan(0);
  });
});

describe("hard gaps vs transferable experience", () => {
  it("shows desktop support as TRANSFERABLE (not verified) for a field technician", () => {
    const r = matchJob(jordan, job("contoso-desktop"), { now });
    const ds = r.requirements.find((x) => x.conceptId === "desktop-support")!;
    expect(ds.status).toBe("TRANSFERABLE");
    expect(ds.transfer?.fromConceptId).toBe("hardware-troubleshooting");
    expect(ds.transfer?.factCodes).toContain("FACT-001");
    expect(r.requirements.find((x) => x.conceptId === "sccm")?.status).toMatch(/GAP/);
  });

  it("marks lab-only skills LEARNING_ONLY, not verified", () => {
    const r = matchJob(jordan, job("contoso-desktop"), { now });
    expect(r.requirements.find((x) => x.conceptId === "active-directory")?.status).toBe("LEARNING_ONLY");
  });

  it("marks unverified evidence NOT_VERIFIED", () => {
    const r = matchJob(jordan, job("fourthcoffee-pos"), { now });
    const phone = r.requirements.find((x) => x.conceptId === "phone-support")!;
    expect(phone.status).toBe("NOT_VERIFIED");
    expect(phone.factCodes).toContain("FACT-013");
  });

  it("counts an earned certification as verified", () => {
    const r = matchJob(sam, job("fabrikam-helpdesk"), { now });
    expect(r.requirements.find((x) => x.conceptId === "comptia-a-plus")?.status).toBe("VERIFIED");
  });
});

describe("hard-requirement overrides", () => {
  const cases: [string, string, CandidateSnapshot][] = [
    ["trey-cleared", "CLEARANCE", jordan],
    ["margies-lowpay", "SALARY_FLOOR", jordan],
    ["alpine-parttime", "EMPLOYMENT_TYPE", jordan],
    ["litware-neteng", "SENIORITY", jordan],
    ["adventure-sysadmin", "DEGREE", jordan],
    ["fabrikam-helpdesk", "LOCATION", jordan],
  ];
  for (const [key, blocker, cand] of cases) {
    it(`${key} → SKIP via ${blocker}`, () => {
      const r = matchJob(cand, job(key), { now });
      expect(r.tier).toBe("SKIP");
      expect(r.blockers.map((b) => b.key)).toContain(blocker);
      expect(r.reasons[0]).toMatch(/Hard requirement override/);
    });
  }

  it("a high score is still overridden by a blocker", () => {
    const r = matchJob(jordan, job("trey-cleared"), { now });
    expect(r.score).toBeGreaterThan(80);
    expect(r.tier).toBe("SKIP");
  });

  it("missing driver's license blocks roles that require one", () => {
    const noLicense: CandidateSnapshot = {
      ...jordan,
      preferences: { ...jordan.preferences, hasDriversLicense: false },
      facts: jordan.facts.filter((f) => f.code !== "FACT-014"),
    };
    const r = matchJob(noLicense, job("proseware-field"), { now });
    expect(r.blockers.map((b) => b.key)).toContain("LICENSE");
  });

  it("excluded companies and keywords block", () => {
    const picky: CandidateSnapshot = { ...jordan, preferences: { ...jordan.preferences, excludedCompanies: ["Proseware POS Solutions (demo)"] } };
    expect(matchJob(picky, job("proseware-field"), { now }).blockers.map((b) => b.key)).toContain("EXCLUDED_COMPANY");
    const kw: CandidateSnapshot = { ...jordan, preferences: { ...jordan.preferences, excludedKeywords: ["Cat6"] } };
    expect(matchJob(kw, job("proseware-field"), { now }).blockers.map((b) => b.key)).toContain("EXCLUDED_KEYWORD");
  });

  it("remote-only candidates are blocked from on-site roles", () => {
    const remoteOnly: CandidateSnapshot = { ...jordan, preferences: { ...jordan.preferences, remotePreference: "REMOTE_ONLY" } };
    expect(matchJob(remoteOnly, job("proseware-field"), { now }).blockers.map((b) => b.key)).toContain("LOCATION");
  });
});
