import { describe, expect, it } from "vitest";
import { DEMO_JOBS, demoJobRecord } from "@/lib/demo/jobs";
import { JORDAN, personaSnapshot } from "@/lib/demo/personas";
import { analyzeJob } from "@/lib/jobs/analyze";
import { matchJob } from "@/lib/matching/engine";
import { computeSkillGaps } from "@/lib/skills/gaps";

const now = new Date("2026-10-04T12:00:00Z");
const jordan = personaSnapshot(JORDAN);
const inputs = DEMO_JOBS.map((d) => {
  const job = demoJobRecord(d, now);
  const analysis = analyzeJob(job);
  return { job, analysis, match: matchJob(jordan, job, { analysis, now }) };
});

describe("skill gap engine", () => {
  const report = computeSkillGaps(jordan, inputs);

  it("only counts gaps from jobs the candidate would consider", () => {
    expect(report.jobsConsidered).toBe(inputs.filter((i) => i.match.tier !== "SKIP").length);
    const skipIds = new Set(inputs.filter((i) => i.match.tier === "SKIP").map((i) => i.job.id));
    for (const r of report.recommendations) for (const j of r.jobs) expect(skipIds.has(j.jobId)).toBe(false);
  });

  it("ranks recurring gaps above one-offs and explains the ranking", () => {
    expect(report.recommendations.length).toBeGreaterThan(3);
    const top = report.recommendations[0];
    expect(top.frequency).toBeGreaterThanOrEqual(2);
    expect(top.rationale).toMatch(/Appears in \d+ jobs?/);
    for (let i = 1; i < report.recommendations.length; i++) expect(report.recommendations[i - 1].priority).toBeGreaterThanOrEqual(report.recommendations[i].priority);
  });

  it("suggests verifying an existing unverified fact as a quick win", () => {
    expect(report.quickWins.some((q) => q.factCodes.includes("FACT-013"))).toBe(true);
  });

  it("does not recommend certifications for one-off, non-certification gaps", () => {
    for (const r of report.recommendations.filter((r) => r.frequency === 1 && r.kind !== "certification")) {
      expect(r.actions.some((a) => a.type === "certification"), r.label).toBe(false);
    }
  });

  it("excludes rejected jobs", () => {
    const rejectedAll = computeSkillGaps(jordan, inputs.map((i) => ({ ...i, rejected: true })));
    expect(rejectedAll.recommendations).toHaveLength(0);
  });
});
