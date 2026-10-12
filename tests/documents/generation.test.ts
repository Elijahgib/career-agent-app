import { describe, expect, it } from "vitest";
import type { AIProvider } from "@/lib/ai";
import { DEMO_JOBS, demoJobRecord } from "@/lib/demo/jobs";
import { DEMO_PERSONAS, JORDAN, personaSnapshot } from "@/lib/demo/personas";
import { generateCoverLetter, styleCheck } from "@/lib/documents/cover-letter";
import { renderText } from "@/lib/documents/render";
import { generateResume } from "@/lib/documents/resume";
import { generateInterviewPrep } from "@/lib/interview/prep";

const now = new Date("2026-10-04T12:00:00Z");

describe("every generated document passes the Truth Gate on first pass", () => {
  for (const p of DEMO_PERSONAS) {
    const snap = personaSnapshot(p);
    for (const d of DEMO_JOBS) {
      it(`${p.key} × ${d.key}`, async () => {
        const job = demoJobRecord(d, now);
        const resume = await generateResume(snap, job, { now });
        expect(resume.gate.violations, JSON.stringify(resume.gate.violations, null, 1)).toEqual([]);
        const letter = generateCoverLetter(snap, job, { now });
        expect(letter.gate.violations, JSON.stringify(letter.gate.violations, null, 1)).toEqual([]);
        const prep = generateInterviewPrep(snap, job, { now });
        expect(prep.gate.violations, JSON.stringify(prep.gate.violations, null, 1)).toEqual([]);
      });
    }
  }
});

describe("resume content", () => {
  const jordan = personaSnapshot(JORDAN);
  const job = demoJobRecord(DEMO_JOBS.find((d) => d.key === "contoso-desktop")!, now);

  it("never contains unsupported desktop-admin, imaging or M365 claims for the field-tech persona", async () => {
    const text = renderText(await generateResume(jordan, job, { now })).toLowerCase();
    for (const banned of ["desktop support technician", "enterprise", "sccm", "imaging", "microsoft 365", "intune", "active directory administration", "phone support", "inventory management", "refurbish"]) {
      expect(text, banned).not.toContain(banned);
    }
  });

  it("cites evidence for every non-header claim", async () => {
    const doc = await generateResume(jordan, job, { now });
    for (const c of doc.claims.filter((c) => c.kind !== "HEADER")) expect(c.supportingFactCodes.length, c.text).toBeGreaterThan(0);
  });

  it("leaves unverified facts out and says so", async () => {
    const doc = await generateResume(jordan, demoJobRecord(DEMO_JOBS.find((d) => d.key === "fourthcoffee-pos")!, now), { now });
    expect(doc.claims.some((c) => c.supportingFactCodes.includes("FACT-013"))).toBe(false);
    expect(doc.meta.excludedUnverified.map((x) => x.code)).toContain("FACT-013");
  });

  it("keeps lab work in Projects & Training", async () => {
    const doc = await generateResume(jordan, job, { now });
    const lab = doc.claims.filter((c) => c.supportingFactCodes.includes("FACT-012"));
    expect(lab.length).toBeGreaterThan(0);
    for (const c of lab) expect(c.section).not.toBe("experience");
    expect(doc.claims.filter((c) => c.section === "competencies").map((c) => c.text)).not.toContain("Active Directory");
  });

  it("orders the most job-relevant bullet first", async () => {
    const doc = await generateResume(jordan, job, { now });
    const first = doc.claims.find((c) => c.id === doc.positions[0].bulletClaimIds[0])!;
    expect(first.supportingFactCodes).toContain("FACT-001");
  });

  it("targets one page for early-career candidates", async () => {
    const doc = await generateResume(jordan, job, { now });
    expect(doc.meta.onePageTarget).toBe(true);
    expect(doc.meta.estimatedLines).toBeLessThanOrEqual(54);
  });
});

describe("AI provider output is gated, never trusted", () => {
  const jordan = personaSnapshot(JORDAN);
  const job = demoJobRecord(DEMO_JOBS.find((d) => d.key === "contoso-desktop")!, now);

  it("blocks the document when the model overstates", async () => {
    const liar: AIProvider = {
      name: "anthropic",
      label: "mock overstating model",
      remote: false,
      async rewriteBullet(req) {
        return req.factCode === "FACT-001" ? "Provided enterprise desktop support and SCCM imaging for 30 stores" : req.factText;
      },
    };
    const doc = await generateResume(jordan, job, { now, provider: liar });
    expect(doc.gate.status).toBe("BLOCKED");
    const phrases = doc.gate.violations.map((v) => v.phrase.toLowerCase());
    expect(phrases.some((p) => p.includes("enterprise desktop support"))).toBe(true);
    expect(phrases.some((p) => p.includes("sccm"))).toBe(true);
  });

  it("passes when the model only rewords within the evidence", async () => {
    const careful: AIProvider = {
      name: "anthropic",
      label: "mock careful model",
      remote: false,
      async rewriteBullet(req) {
        return req.factCode === "FACT-001" ? "Diagnosed and repaired POS systems, printers, scanners and payment peripherals across retail store locations" : req.factText.replace(/\.$/, "");
      },
    };
    const doc = await generateResume(jordan, job, { now, provider: careful });
    expect(doc.gate.violations).toEqual([]);
  });

  it("falls back to canonical text when the provider errors, and records it", async () => {
    const broken: AIProvider = { name: "openai", label: "broken", remote: false, async rewriteBullet() { throw new Error("timeout"); } };
    const doc = await generateResume(jordan, job, { now, provider: broken });
    expect(doc.gate.status).toBe("PASSED");
    expect(doc.meta.providerNotes.length).toBeGreaterThan(0);
  });
});

describe("cover letter", () => {
  const jordan = personaSnapshot(JORDAN);
  const job = demoJobRecord(DEMO_JOBS.find((d) => d.key === "contoso-desktop")!, now);

  it("references the role and company and states transferable skills as transferable", () => {
    const doc = generateCoverLetter(jordan, job, { now });
    const text = renderText(doc);
    expect(text).toContain("Desktop Support Technician position at Contoso Health (demo)");
    expect(text).toMatch(/is relevant to the desktop support work in this role/);
    expect(text.toLowerCase()).not.toMatch(/experienced desktop support|my desktop support experience/);
  });

  it("flags hype words", () => {
    expect(styleCheck("I am thrilled and passionate about this dream job.")).toHaveLength(3);
  });
});

describe("interview prep", () => {
  const jordan = personaSnapshot(JORDAN);
  const prep = generateInterviewPrep(jordan, demoJobRecord(DEMO_JOBS.find((d) => d.key === "contoso-desktop")!, now), { now });

  it("coaches honest answers for gaps", () => {
    const sccm = prep.hardGapQuestions.find((q) => q.conceptId === "sccm");
    expect(sccm).toBeDefined();
    const script = prep.claims.find((c) => c.id === sccm!.scriptClaimIds[0])!;
    expect(script.text).toMatch(/^I haven't worked with SCCM|^I haven't worked with Microsoft SCCM/);
  });

  it("warns not to claim transferable skills as experience", () => {
    expect(prep.doNotClaim.some((d) => /desktop support/i.test(d.phrase))).toBe(true);
  });

  it("builds STAR stories only from verified facts", () => {
    for (const s of prep.starStories) {
      const fact = jordan.facts.find((f) => f.code === s.factCode)!;
      expect(fact.verificationStatus).toBe("VERIFIED");
    }
  });
});

describe("first-pass document quality (all demo personas × jobs)", () => {
  for (const p of DEMO_PERSONAS) {
    const snap = personaSnapshot(p);
    for (const d of DEMO_JOBS) {
      it(`${p.key} × ${d.key}: no duplicate bullets, bounded length, no JD copy`, async () => {
        const job = demoJobRecord(d, now);
        const resume = await generateResume(snap, job, { now });

        // No exact-duplicate experience bullets (repetition is a classic generated-resume smell).
        const bullets = resume.claims.filter((c) => c.kind === "EXPERIENCE").map((c) => c.text.trim().toLowerCase()).filter(Boolean);
        expect(new Set(bullets).size, `duplicate bullet in ${p.key} × ${d.key}`).toBe(bullets.length);

        // Early-career resumes stay to one page.
        if (resume.meta.onePageTarget) expect(resume.meta.estimatedLines ?? 0).toBeLessThanOrEqual(54);

        // No resume bullet is copied verbatim from the job description.
        const jd = job.description.toLowerCase();
        for (const b of bullets) if (b.length >= 40) expect(jd.includes(b), `bullet copied from JD in ${p.key} × ${d.key}`).toBe(false);

        // Cover letter is short and useful, never a wall of text.
        const letter = generateCoverLetter(snap, job, { now });
        const words = renderText(letter).split(/\s+/).filter(Boolean).length;
        expect(words, `cover letter length ${words} for ${p.key} × ${d.key}`).toBeGreaterThan(40);
        expect(words, `cover letter length ${words} for ${p.key} × ${d.key}`).toBeLessThanOrEqual(600);
      });
    }
  }
});
