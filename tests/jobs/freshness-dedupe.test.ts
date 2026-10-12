import { describe, expect, it } from "vitest";
import { DEMO_JOBS, demoJobRecord } from "@/lib/demo/jobs";
import { applyReadiness, freshness, sourceLeadNote } from "@/lib/jobs/freshness";
import { dedupeKey, htmlToText, normalizeCompany } from "@/lib/jobs/normalize";

const now = new Date("2026-10-04T12:00:00Z");

describe("freshness", () => {
  it("buckets by posted date, falling back to first seen", () => {
    expect(freshness({ postedAt: new Date("2026-10-03T12:00:00Z"), firstSeenAt: now }, now)).toMatchObject({ bucket: "NEW", basis: "POSTED", ageDays: 1 });
    expect(freshness({ postedAt: null, firstSeenAt: new Date("2026-09-01T12:00:00Z") }, now)).toMatchObject({ bucket: "STALE", basis: "FIRST_SEEN" });
  });
});

describe("apply readiness", () => {
  const d = DEMO_JOBS.find((j) => j.key === "proseware-field")!;
  it("requires recent structured verification before APPLY NOW", () => {
    expect(applyReadiness(demoJobRecord(d, now), "STRONG", now).label).toBe("VERIFY_FIRST");
    expect(applyReadiness(demoJobRecord(d, now, { verified: true }), "STRONG", now).label).toBe("APPLY_NOW");
  });
  it("never says APPLY NOW for SKIP or closed postings", () => {
    expect(applyReadiness(demoJobRecord(d, now, { verified: true }), "SKIP", now).label).toBe("NOT_RECOMMENDED");
    expect(applyReadiness({ ...demoJobRecord(d, now, { verified: true }), status: "CLOSED" }, "STRONG", now).label).toBe("CLOSED");
  });
});

describe("dedupe", () => {
  it("treats the same job from different sources as one", () => {
    expect(dedupeKey("Contoso Health, Inc.", "Sr. Desktop Support Tech (REQ 2291)", "Austin, TX, United States")).toBe(dedupeKey("contoso health", "Senior Desktop Support Technician", "Austin TX"));
    expect(normalizeCompany("The Fabrikam Company LLC")).toBe("fabrikam");
  });
  it("keeps different roles apart", () => {
    expect(dedupeKey("Contoso", "Desktop Support Technician", "Austin, TX")).not.toBe(dedupeKey("Contoso", "Help Desk Technician", "Austin, TX"));
  });
  it("notes when the employer feed found a job first", () => {
    const note = sourceLeadNote({
      sources: [
        { sourceType: "GREENHOUSE", sourceName: "contoso", externalId: "1", firstSeenAt: new Date("2026-10-01"), lastSeenAt: now },
        { sourceType: "MANUAL", sourceName: "alert", externalId: "x", firstSeenAt: new Date("2026-10-04"), lastSeenAt: now },
      ],
    });
    expect(note).toMatch(/Found directly from the employer's greenhouse feed 3 days before manual/);
  });
});

describe("html to text", () => {
  it("keeps list structure and decodes double-encoded entities", () => {
    const t = htmlToText("&lt;h3&gt;Requirements&lt;/h3&gt;&lt;ul&gt;&lt;li&gt;Windows &amp;amp; macOS&lt;/li&gt;&lt;li&gt;A+&lt;/li&gt;&lt;/ul&gt;");
    expect(t).toContain("Requirements");
    expect(t).toContain("- Windows & macOS");
    expect(t).toContain("- A+");
  });
});
