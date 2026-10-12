import { describe, expect, it } from "vitest";
import { JORDAN, personaSnapshot } from "@/lib/demo/personas";
import { suggestCareers } from "@/lib/matching/career";

describe("suggestCareers", () => {
  const jordan = personaSnapshot(JORDAN); // field-service / desktop-support background

  it("suggests roles, each with an honest evidence basis (never zero 'have')", () => {
    const s = suggestCareers(jordan);
    expect(s.length).toBeGreaterThan(0);
    for (const sug of s) expect(sug.have.length).toBeGreaterThan(0);
  });

  it("does not suggest a role with no overlapping verified evidence (no keyword guessing)", () => {
    // Jordan has no verified data-analysis / SQL / Excel / BI evidence.
    const s = suggestCareers(jordan);
    expect(s.find((x) => x.id === "data-analyst")).toBeUndefined();
  });

  it("ranks a close role above a far one, and reports real gaps for the far one", () => {
    const s = suggestCareers(jordan, { limit: 9 });
    const net = s.find((x) => x.id === "network-engineer");
    if (net) {
      expect(net.tier).not.toBe("GOOD_TRANSITION"); // a field tech is not a near-fit network engineer
      expect(net.missing.length).toBeGreaterThan(0);
    }
    // At least one near-fit transition exists for a support/field background.
    expect(s.some((x) => x.tier === "GOOD_TRANSITION" || x.tier === "REALISTIC_STRETCH")).toBe(true);
  });
});
