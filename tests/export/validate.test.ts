// Unit tests for import validation — malformed backup files must be rejected with a clear
// message BEFORE any database write (Phase M/O). No DB needed: validateImport is pure.
import { describe, expect, it } from "vitest";
import { EXPORT_FORMAT, validateImport } from "@/server/export";

const minimal = () => ({ format: EXPORT_FORMAT, profile: { displayName: "Test User" } });

describe("validateImport", () => {
  it("rejects non-objects", () => {
    expect(() => validateImport(null)).toThrow();
    expect(() => validateImport(undefined)).toThrow();
    expect(() => validateImport("nope")).toThrow();
    expect(() => validateImport(42)).toThrow();
    expect(() => validateImport([])).toThrow(/format/i);
  });

  it("rejects a wrong or missing format", () => {
    expect(() => validateImport({ profile: { displayName: "x" } })).toThrow(/format/i);
    expect(() => validateImport({ format: "something-else@9", profile: { displayName: "x" } })).toThrow(/format/i);
  });

  it("rejects a missing profile or blank name", () => {
    expect(() => validateImport({ format: EXPORT_FORMAT })).toThrow(/profile/i);
    expect(() => validateImport({ format: EXPORT_FORMAT, profile: {} })).toThrow(/name/i);
    expect(() => validateImport({ format: EXPORT_FORMAT, profile: { displayName: "   " } })).toThrow(/name/i);
  });

  it("accepts a minimal valid export and normalises every collection to an array", () => {
    const out = validateImport(minimal());
    expect(out.profile.displayName).toBe("Test User");
    for (const k of ["positions", "education", "facts", "applications", "documents", "notifications", "emailSignals"] as const) {
      expect(Array.isArray(out.profile[k])).toBe(true);
    }
    expect(Array.isArray(out.jobs)).toBe(true);
  });

  it("coerces malformed collections (object/string instead of array) to empty arrays so iteration can't throw", () => {
    const out = validateImport({
      format: EXPORT_FORMAT,
      profile: { displayName: "X", facts: { not: "an array" }, applications: "boom" },
      jobs: "nope",
    });
    expect(out.profile.facts).toEqual([]);
    expect(out.profile.applications).toEqual([]);
    expect(out.jobs).toEqual([]);
  });
});
