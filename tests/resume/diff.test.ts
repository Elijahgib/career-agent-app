import { describe, expect, it } from "vitest";
import { diffPositions, diffSummary, type ExistingPosition } from "@/lib/resume/diff";
import type { ParsedPosition } from "@/lib/resume/parse";

const pos = (p: Partial<ParsedPosition>): ParsedPosition => ({ bullets: [], uncertain: false, ...p });

const EXISTING: ExistingPosition[] = [
  { id: "a", employer: "NCR Voyix", title: "Customer Engineer", startDate: "2024-11", endDate: null },
  { id: "b", employer: "RJP Electric", title: "Com Tech 1", startDate: "2023-08", endDate: "2024-03" },
];

describe("diffPositions — re-upload never blindly duplicates", () => {
  it("UNCHANGED when the same role is re-imported", () => {
    const d = diffPositions([pos({ employer: "NCR Voyix", title: "Customer Engineer", startDate: "2024-11", endDate: null })], EXISTING);
    expect(d[0].status).toBe("UNCHANGED");
  });

  it("UPDATED when an end date changes (present → a date)", () => {
    const d = diffPositions([pos({ employer: "NCR Voyix", title: "Customer Engineer", startDate: "2024-11", endDate: "2026-10" })], EXISTING);
    expect(d[0].status).toBe("UPDATED");
    expect(d[0].note).toMatch(/end date/i);
    expect(d[0].changes.join(" ")).toMatch(/present.*2026-10/);
  });

  it("NEW when a new employer appears", () => {
    const d = diffPositions([pos({ employer: "Spectrum", title: "Field Technician 2", startDate: "2022-02", endDate: "2022-11" })], EXISTING);
    expect(d[0].status).toBe("NEW");
    expect(d[0].note).toMatch(/new work experience/i);
  });

  it("POSSIBLE_DUPLICATE for the same employer with a different title", () => {
    const d = diffPositions([pos({ employer: "NCR Voyix", title: "Field Engineer", startDate: "2024-11", endDate: null })], EXISTING);
    expect(d[0].status).toBe("POSSIBLE_DUPLICATE");
  });

  it("matches loosely (NCR vs NCR Voyix) and does not double-count one existing role", () => {
    const d = diffPositions(
      [
        pos({ employer: "NCR", title: "Customer Engineer", startDate: "2024-11", endDate: null }),
        pos({ employer: "NCR Voyix", title: "Customer Engineer", startDate: "2024-11", endDate: null }),
      ],
      EXISTING,
    );
    expect(d[0].status).toBe("UNCHANGED");
    expect(d[1].status).toBe("NEW"); // the one existing role was already claimed, so the 2nd falls through
  });

  it("summarises counts", () => {
    const d = diffPositions(
      [
        pos({ employer: "NCR Voyix", title: "Customer Engineer", startDate: "2024-11", endDate: "2026-10" }),
        pos({ employer: "Globex", title: "Analyst", startDate: "2020-01", endDate: "2021-01" }),
      ],
      EXISTING,
    );
    const s = diffSummary(d);
    expect(s.UPDATED).toBe(1);
    expect(s.NEW).toBe(1);
  });
});
