// Integration test: real Prisma + SQLite (throwaway file), real services.
import { exec } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execAsync = promisify(exec);
import type { FetchLike } from "@/lib/sources/types";
import { parseResumeText } from "@/lib/resume/parse";
import { GREENHOUSE_LIST } from "../fixtures/ats";
// NOTE: do not statically import anything that pulls in "@/server/db" here — static imports are
// hoisted and would construct the Prisma client against the default dev.db before the test sets
// DATABASE_URL below. Import such modules dynamically inside tests/hooks instead.

const SAMPLE_RESUME = `Jordan Rivera
St. Louis, MO
jordan.rivera@example.com | (314) 555-0199

WORK EXPERIENCE
Field Service Technician — Acme Retail, St. Louis, MO
June 2022 - Present
- Diagnosed and repaired POS systems and printers

EDUCATION
A.A.S. Network Administration — St. Louis Community College
2020

SKILLS
Windows, POS systems, Printer repair

CERTIFICATIONS
CompTIA A+
`;

// Mirrors the REAL PDF extraction shape (tabs = column gaps): employer<tab>date on one line,
// title/location below, wrapped duty lines, two-column competencies, a duplicate skill.
const REAL_LAYOUT_TEXT = [
  "Jamie Doe",
  "St. Louis, MO | jamie.doe@example.com | (314) 555-0100",
  "EXPERIENCE",
  "Globex Retail Systems\tNov 2024 - Present",
  "Customer Engineer",
  "St. Louis, MO",
  "Diagnose and repair point-of-sale and self-checkout",
  "hardware across multiple retail sites.",
  "Own service tickets end to end, keeping records accurate,",
  "and close each ticket cleanly.",
  "Coordinate parts and schedules to meet service targets.",
  "Volt Electrical Services\tAug 2023 - Mar 2024",
  "Com Tech 1",
  "St. Louis, MO",
  "Pull and terminate low-voltage and data cabling for new",
  "commercial builds.",
  "Test and label network drops and document runs.",
  "Brightwave Communications\tFeb 2022 - Nov 2022",
  "Field Technician 2",
  "St. Louis, MO",
  "Install residential internet and television equipment.",
  "Troubleshoot signal issues at the demarcation point.",
  "CORE COMPETENCIES",
  "Hardware and Peripheral Troubleshooting\tPrinter Support",
  "Network Troubleshooting\tService Ticket Management",
  "Asset and Service Records\tLow-Voltage and Data Cabling",
  "Connectivity Troubleshooting\tNetworking Hardware",
  "SKILLS",
  "Microsoft Excel, Word, PowerPoint",
  "Service Ticketing Software, Documentation and Reporting",
  "Printer Support, network troubleshooting",
  "EDUCATION",
  "Certificate in Welding and Fabrication\t2023",
  "Example Technical College",
  "St. Louis, MO",
].join("\n");

const dbFile = path.resolve(__dirname, `../../prisma/test-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_URL = `file:${dbFile}`;

type Services = {
  db: typeof import("@/server/db").db;
  seed: typeof import("@/server/seed");
  matching: typeof import("@/server/matching");
  documents: typeof import("@/server/documents");
  exporter: typeof import("@/server/export");
  profiles: typeof import("@/server/profiles");
  tracker: typeof import("@/server/tracker");
  email: typeof import("@/server/email");
  scan: typeof import("@/server/scan");
  jobs: typeof import("@/server/jobs");
};
let s: Services;
let jordanId: string;
const jobId = async (title: string) => (await s.db.job.findFirstOrThrow({ where: { title } })).id;

beforeAll(async () => {
  // Sweep any leftover test DBs from prior (possibly killed) runs so their seeded rows can
  // never collide with this run; this run then uses its own freshly named, empty DB.
  const prismaDir = path.dirname(dbFile);
  for (const f of readdirSync(prismaDir)) {
    if (/^test-.*\.db(-(journal|wal|shm))?$/.test(f)) {
      try { await rm(path.join(prismaDir, f), { force: true, maxRetries: 5, retryDelay: 50 }); } catch { /* best effort */ }
    }
  }
  // Async (not execSync) so the worker event loop keeps servicing vitest's reporter RPC
  // while the migration runs — a synchronous child process here stalls it long enough on
  // Windows to trip "Timeout calling onTaskUpdate".
  await execAsync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: `file:${dbFile}` } });
  s = {
    db: (await import("@/server/db")).db,
    seed: await import("@/server/seed"),
    matching: await import("@/server/matching"),
    documents: await import("@/server/documents"),
    exporter: await import("@/server/export"),
    profiles: await import("@/server/profiles"),
    tracker: await import("@/server/tracker"),
    email: await import("@/server/email"),
    scan: await import("@/server/scan"),
    jobs: await import("@/server/jobs"),
  };
  await s.seed.seedDemo();
  jordanId = (await s.db.candidateProfile.findFirstOrThrow({ where: { displayName: { startsWith: "Jordan" } } })).id;
  // Generous: `npx prisma migrate deploy` + seed can be slow on Windows under parallel load
  // (other suites — e.g. pdf.js extraction — compete for CPU).
}, 240_000);

afterAll(async () => {
  await s?.db.$disconnect();
  // Windows keeps the SQLite file handle for a moment after $disconnect, so removing the
  // throwaway db can hit EPERM; retry, include the WAL/SHM sidecars, and never let a
  // stray temp file (pid-named and gitignored) fail the suite.
  for (const f of [dbFile, `${dbFile}-journal`, `${dbFile}-wal`, `${dbFile}-shm`]) {
    try {
      if (existsSync(f)) await rm(f, { force: true, maxRetries: 10, retryDelay: 100 });
    } catch {
      // best-effort cleanup of a harmless throwaway file
    }
  }
});

describe("seed + matching", () => {
  it("loads synthetic profiles and dedupes repeated postings with provenance", async () => {
    expect(await s.db.candidateProfile.count()).toBe(3);
    const contoso = await s.db.job.findFirstOrThrow({ where: { title: "Desktop Support Technician" }, include: { sources: true } });
    expect(contoso.sources.map((x) => x.sourceType).sort()).toEqual(["DEMO", "MANUAL"]);
  });

  it("scores every job and persists results", async () => {
    const { scored } = await s.matching.ensureMatches(jordanId);
    const tier = (t: string) => scored.find((x) => x.job.title === t)!.match.tier;
    expect(tier("Field Service Technician II")).toBe("STRONG");
    expect(tier("IT Field Technician")).toBe("SKIP");
    expect(await s.db.jobMatch.count({ where: { profileId: jordanId } })).toBe(scored.length);
  });
});

describe("documents", () => {
  it("versions generated documents and passes the Truth Gate", async () => {
    const id = await jobId("Desktop Support Technician");
    const v1 = await s.documents.generateAndStore(jordanId, id, "RESUME");
    const v2 = await s.documents.generateAndStore(jordanId, id, "RESUME");
    expect([v1.status, v1.version, v2.version]).toEqual(["PASSED", 1, 2]);
    const letter = await s.documents.generateAndStore(jordanId, id, "COVER_LETTER");
    expect(letter.status).toBe("PASSED");
  });

  it("re-validates user edits and stores overstated edits as BLOCKED", async () => {
    const id = await jobId("Desktop Support Technician");
    const doc = await s.db.generatedDocument.findFirstOrThrow({ where: { profileId: jordanId, jobId: id, kind: "RESUME" }, orderBy: { version: "desc" } });
    const stored = await s.documents.loadDocument(doc.id, jordanId);
    const bullet = stored!.doc.claims.find((c) => c.section === "experience" && c.supportingFactCodes.includes("FACT-001"))!;
    const edited = await s.documents.editClaim(jordanId, doc.id, bullet.id, "Led enterprise desktop support and PC imaging for 45 stores");
    expect(edited.status).toBe("BLOCKED");
    const gate = JSON.parse(edited.gateJson);
    const rules = gate.violations.map((v: { rule: string }) => v.rule);
    expect(rules).toEqual(expect.arrayContaining(["PROHIBITED_EXPANSION", "UNSUPPORTED_METRIC", "RESPONSIBILITY_INFLATION"]));
  });
});

describe("tracker + email suggestions", () => {
  it("logs status history and sets applied/follow-up dates", async () => {
    const id = await jobId("POS Support Technician");
    const app = await s.tracker.ensureApplication(jordanId, id);
    const updated = await s.tracker.changeStatus(jordanId, app.id, "APPLIED", "Applied on site");
    expect(updated?.appliedAt).toBeTruthy();
    expect(updated?.followUpAt).toBeTruthy();
    const events = await s.db.applicationEvent.findMany({ where: { applicationId: app.id } });
    expect(events.map((e) => e.toStatus)).toContain("APPLIED");
  });

  it("never changes status until the user confirms an email suggestion", async () => {
    const r = await s.email.scanInbox(jordanId);
    expect(r.created).toBeGreaterThan(0);
    const sig = await s.db.emailSignal.findFirstOrThrow({ where: { profileId: jordanId, detectedType: "INTERVIEW", applicationId: { not: null } } });
    const before = await s.db.application.findUniqueOrThrow({ where: { id: sig.applicationId! } });
    expect(before.status).not.toBe("INTERVIEW");
    await s.email.resolveSignal(jordanId, sig.id, true);
    const after = await s.db.application.findUniqueOrThrow({ where: { id: sig.applicationId! }, include: { events: true } });
    expect(after.status).toBe("INTERVIEW");
    expect(after.events.some((e) => e.actor === "EMAIL_SUGGESTION")).toBe(true);
  });
});

describe("background scan", () => {
  const fetcher = (body: unknown): FetchLike => async () => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });

  it("imports postings from a saved source and closes ones that disappear", async () => {
    await s.db.sourceConfig.create({ data: { sourceType: "GREENHOUSE", identifier: "examplecorp" } });
    const first = await s.scan.runScan({ fetcher: fetcher(GREENHOUSE_LIST) });
    expect(first).toMatchObject({ status: "SUCCEEDED", jobsSeen: 2, jobsNew: 2 });
    const job = await s.db.job.findFirstOrThrow({ where: { title: "IT Support Technician" } });
    expect(JSON.parse(job.fieldVerificationJson).postingExists).toBe("VERIFIED");
    const second = await s.scan.runScan({ fetcher: fetcher({ jobs: [GREENHOUSE_LIST.jobs[0]] }) });
    expect(second.jobsClosed).toBe(1);
    expect((await s.db.job.findFirstOrThrow({ where: { title: "Remote Service Desk Analyst" } })).status).toBe("CLOSED");
  });
});

describe("export, import and delete", () => {
  it("round-trips a profile and deletes everything on request", async () => {
    const data = await s.exporter.exportProfile(jordanId);
    expect(data?.profile.facts.length).toBe(14);
    const imported = await s.exporter.importProfile(JSON.parse(JSON.stringify(data)));
    expect(await s.db.evidenceFact.count({ where: { profileId: imported.id } })).toBe(14);
    expect(await s.db.application.count({ where: { profileId: imported.id } })).toBe(await s.db.application.count({ where: { profileId: jordanId } }));
    await s.profiles.deleteProfile(imported.id);
    for (const model of ["evidenceFact", "application", "generatedDocument", "position", "jobMatch"] as const) {
      // @ts-expect-error dynamic model access in test
      expect(await s.db[model].count({ where: { profileId: imported.id } })).toBe(0);
    }
  });
});

describe("profile isolation (friend mode)", () => {
  it("keeps each candidate's data separate and leaks nothing across profiles", async () => {
    const a = await s.profiles.createProfile({ displayName: "Isolation A" });
    const b = await s.profiles.createProfile({ displayName: "Isolation B" });
    await s.db.evidenceFact.create({ data: { profileId: a.id, code: "FACT-001", category: "DUTY", experienceType: "PROFESSIONAL", canonicalFact: "A-only secret fact", verificationStatus: "VERIFIED" } });
    await s.db.evidenceFact.create({ data: { profileId: b.id, code: "FACT-001", category: "DUTY", experienceType: "PROFESSIONAL", canonicalFact: "B-only secret fact", verificationStatus: "VERIFIED" } });

    const snapA = await s.profiles.getSnapshot(a.id);
    const snapB = await s.profiles.getSnapshot(b.id);
    const textsA = snapA!.facts.map((f) => f.canonicalFact);
    const textsB = snapB!.facts.map((f) => f.canonicalFact);
    expect(textsA).toContain("A-only secret fact");
    expect(textsA).not.toContain("B-only secret fact");
    expect(textsB).toContain("B-only secret fact");
    expect(textsB).not.toContain("A-only secret fact");

    // Deleting A removes only A's rows; B is untouched.
    await s.profiles.deleteProfile(a.id);
    expect(await s.db.evidenceFact.count({ where: { profileId: a.id } })).toBe(0);
    expect(await s.db.evidenceFact.count({ where: { profileId: b.id } })).toBe(1);
    await s.profiles.deleteProfile(b.id);
  });
});

describe("import safety", () => {
  it("rolls back and does not corrupt the DB when a row is malformed", async () => {
    const before = await s.db.candidateProfile.count();
    const bad = {
      format: "career-agent-app/profile-export@1",
      profile: {
        displayName: "Broken Import",
        facts: [
          { code: "FACT-001", category: "DUTY", experienceType: "PROFESSIONAL", canonicalFact: "ok" },
          // Required `category` is null → the DB rejects this row mid-import.
          { code: "FACT-002", category: null, experienceType: null, canonicalFact: "bad" },
        ],
      },
      jobs: [],
    };
    await expect(s.exporter.importProfile(bad)).rejects.toThrow(/rolled back/i);
    expect(await s.db.candidateProfile.count()).toBe(before);
    expect(await s.db.candidateProfile.findFirst({ where: { displayName: { startsWith: "Broken Import" } } })).toBeNull();
  });
});

describe("resume import (structured, prefills onboarding review)", () => {
  it("imports parsed resume data as UNVERIFIED facts/positions/education and prefills contact", async () => {
    const { importParsedResume } = await import("@/server/resume-import");
    const prof = await s.profiles.createProfile({ displayName: "Unnamed candidate" });
    const parsed = parseResumeText(SAMPLE_RESUME);
    const r = await importParsedResume(prof.id, parsed);

    expect(r.positions).toBeGreaterThanOrEqual(1);
    expect(r.education).toBeGreaterThanOrEqual(1);
    expect(r.skills).toBeGreaterThanOrEqual(1);
    expect(r.certifications).toBeGreaterThanOrEqual(1);

    // Everything imported is UNVERIFIED (nothing is trusted automatically).
    const facts = await s.db.evidenceFact.findMany({ where: { profileId: prof.id } });
    expect(facts.length).toBeGreaterThan(0);
    expect(facts.every((f) => f.verificationStatus === "UNVERIFIED")).toBe(true);
    const positions = await s.db.position.findMany({ where: { profileId: prof.id } });
    expect(positions.length).toBeGreaterThanOrEqual(1);
    expect(positions.every((p) => p.verificationStatus === "UNVERIFIED")).toBe(true);
    const edu = await s.db.education.findMany({ where: { profileId: prof.id } });
    expect(edu.every((e) => e.verificationStatus === "UNVERIFIED")).toBe(true);

    // Empty identity was prefilled from the resume; this is the data the onboarding review shows.
    const updated = await s.db.candidateProfile.findUniqueOrThrow({ where: { id: prof.id } });
    expect(updated.displayName).toBe("Jordan Rivera");
    expect(updated.email).toBe("jordan.rivera@example.com");

    await s.profiles.deleteProfile(prof.id);
  });
});

describe("resume import — real layout: parse-before-persist, persisted counts, idempotent re-upload", () => {
  it("parses 3/7/1/13/0, persists the same, and a same-resume re-upload adds nothing", async () => {
    const { importParsedResume } = await import("@/server/resume-import");
    const { stashPendingImport, computePendingDiff, applyPendingImport } = await import("@/server/resume-merge");

    // STAGE B — parser output BEFORE any persistence.
    const parsed = parseResumeText(REAL_LAYOUT_TEXT);
    expect(parsed.positions.length).toBe(3);
    expect(parsed.positions.reduce((a, p) => a + p.bullets.length, 0)).toBe(7);
    expect(parsed.education.length).toBe(1);
    expect(parsed.skills.length).toBe(13);
    expect(parsed.certifications.length).toBe(0);

    // STAGE C — persisted counts match exactly.
    const prof = await s.profiles.createProfile({ displayName: "Unnamed candidate" });
    await importParsedResume(prof.id, parsed);
    const counts = async () => ({
      positions: await s.db.position.count({ where: { profileId: prof.id } }),
      education: await s.db.education.count({ where: { profileId: prof.id } }),
      duties: await s.db.evidenceFact.count({ where: { profileId: prof.id, category: "DUTY" } }),
      skills: await s.db.evidenceFact.count({ where: { profileId: prof.id, category: "SKILL" } }),
      certs: await s.db.evidenceFact.count({ where: { profileId: prof.id, category: "CERTIFICATION" } }),
    });
    const after1 = await counts();
    expect(after1).toEqual({ positions: 3, education: 1, duties: 7, skills: 13, certs: 0 });

    // IDEMPOTENT re-upload of the identical resume → all UNCHANGED, apply adds nothing.
    await stashPendingImport(prof.id, parseResumeText(REAL_LAYOUT_TEXT));
    const diff = await computePendingDiff(prof.id);
    expect(diff!.diffs.every((d) => d.status === "UNCHANGED")).toBe(true);
    await applyPendingImport(prof.id, new Set([0, 1, 2]));
    expect(await counts()).toEqual(after1);

    await s.profiles.deleteProfile(prof.id);
  });
});
