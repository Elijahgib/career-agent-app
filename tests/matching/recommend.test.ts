import { describe, expect, it } from "vitest";
import type { Blocker, MatchResult, RequirementMatch, Tier } from "@/lib/matching/engine";
import { applyRecommendation, fitBuckets, tierLabel } from "@/lib/matching/recommend";

const COUNTS = { required: 5, requiredVerified: 3, hardGaps: 1, transferable: 1, notVerified: 0, exposureOnly: 0, partial: 0, preferredGaps: 0 };

function mk(p: { tier: Tier; blockers?: Blocker[]; counts?: typeof COUNTS; requirements?: RequirementMatch[] }): MatchResult {
  return { tier: p.tier, blockers: p.blockers ?? [], counts: p.counts ?? COUNTS, requirements: p.requirements ?? [] } as unknown as MatchResult;
}

describe("applyRecommendation", () => {
  it("APPLY for a strong match", () => expect(applyRecommendation(mk({ tier: "STRONG" })).label).toBe("APPLY"));
  it("WORTH A SHOT for a good match", () => expect(applyRecommendation(mk({ tier: "GOOD" })).label).toBe("WORTH A SHOT"));
  it("STRETCH, BUT POSSIBLE for a stretch", () => expect(applyRecommendation(mk({ tier: "STRETCH" })).label).toBe("STRETCH, BUT POSSIBLE"));
  it("PROBABLY SKIP for a skip with no hard blocker", () => expect(applyRecommendation(mk({ tier: "SKIP" })).label).toBe("PROBABLY SKIP"));

  it("HARD BLOCK when a hard requirement overrides", () => {
    const r = applyRecommendation(mk({ tier: "SKIP", blockers: [{ key: "CLEARANCE", message: "Requires an existing secret clearance." }] }));
    expect(r.label).toBe("HARD BLOCK");
    expect(r.rationale).toMatch(/clearance/i);
  });

  it("a hard blocker wins even over a strong score (never call it applyable)", () => {
    expect(applyRecommendation(mk({ tier: "STRONG", blockers: [{ key: "SALARY_FLOOR", message: "Pay below your floor." }] })).label).toBe("HARD BLOCK");
  });

  it("does NOT tell people to skip merely for lacking preferred skills (stretch stays possible)", () => {
    expect(applyRecommendation(mk({ tier: "STRETCH", counts: { ...COUNTS, requiredVerified: 2, hardGaps: 2 } })).label).toBe("STRETCH, BUT POSSIBLE");
  });

  it("stated interest upgrades a no-blocker SKIP to a possible stretch", () => {
    expect(applyRecommendation(mk({ tier: "SKIP" }), { interested: true }).label).toBe("STRETCH, BUT POSSIBLE");
  });
});

describe("tierLabel / fitBuckets", () => {
  it("renders human labels, never a percentage", () => {
    expect(tierLabel("STRONG")).toBe("Strong match");
    expect(tierLabel("GOOD")).toBe("Good match");
    expect(tierLabel("STRETCH")).toBe("Stretch");
    expect(tierLabel("SKIP")).toBe("Skip");
  });

  it("splits requirements into strong / transferable / missing", () => {
    const reqs = [
      { status: "VERIFIED" }, { status: "PARTIAL" }, { status: "TRANSFERABLE" }, { status: "EXPOSURE_ONLY" }, { status: "HARD_GAP" }, { status: "GAP" },
    ] as RequirementMatch[];
    const b = fitBuckets(mk({ tier: "GOOD", requirements: reqs }));
    expect(b.strong).toHaveLength(1);
    expect(b.transferable).toHaveLength(3);
    expect(b.missing).toHaveLength(2);
  });
});
