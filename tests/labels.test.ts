import { describe, expect, it } from "vitest";
import { careerLevelLabel, categoryLabel, experienceTypeLabel, verificationLabel } from "@/lib/labels";

describe("user-facing labels", () => {
  it("polishes experience types (keeps the honesty tiers readable)", () => {
    expect(experienceTypeLabel("PROFESSIONAL")).toBe("Professional");
    expect(experienceTypeLabel("PROJECT")).toBe("Project");
    expect(experienceTypeLabel("LEARNING")).toBe("Lab / Study");
  });
  it("polishes verification states", () => {
    expect(verificationLabel("VERIFIED")).toBe("Verified");
    expect(verificationLabel("UNVERIFIED")).toBe("Unverified");
    expect(verificationLabel("LIKELY")).toBe("Likely");
  });
  it("polishes categories including SOFT_SKILL", () => {
    expect(categoryLabel("SOFT_SKILL")).toBe("Soft Skill");
    expect(categoryLabel("CERTIFICATION")).toBe("Certification");
  });
  it("polishes career levels", () => {
    expect(careerLevelLabel("EARLY")).toBe("Early career");
  });
});
