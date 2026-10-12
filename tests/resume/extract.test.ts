// Extraction tests build REAL .docx / .pdf bytes in-test (pure-JS docx / pdf-lib) and run them
// through the actual extractor. PDF goes through unpdf's serverless pdf.js — no web worker, so
// this also guards against the Next/Turbopack "fake worker" regression (extraction must succeed
// in plain Node with zero worker configuration).
import { Document, Packer, Paragraph } from "docx";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { parseResumeText } from "@/lib/resume/parse";
import { extractResumeBytes } from "@/server/resume-extract";

const SINGLE = [["Jordan Rivera", "jordan@example.com", "WORK EXPERIENCE", "Field Technician — Acme Retail", "June 2022 - Present", "- Repaired POS systems and printers", "SKILLS", "Windows, Printers, Ticketing"]];

const MULTI_JOB = [
  ["Jordan Rivera", "St. Louis, MO", "jordan@example.com", "WORK EXPERIENCE", "Field Service Technician - Acme Retail, St. Louis, MO", "June 2022 - Present", "- Diagnosed and repaired POS systems and printers"],
  ["POS Support Technician - Contoso", "2020 - 2022", "- Supported point-of-sale terminals", "", "EDUCATION", "A.A.S. Network Administration - St. Louis Community College", "2020", "", "SKILLS", "Windows, POS systems, Printer repair"],
];

async function makeDocx(lines: string[]): Promise<Uint8Array> {
  const doc = new Document({ sections: [{ children: lines.map((l) => new Paragraph(l)) }] });
  return new Uint8Array(await Packer.toBuffer(doc));
}

async function makePdf(pages: string[][]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const lines of pages) {
    const page = pdf.addPage([612, 792]);
    let y = 740;
    for (const l of lines) {
      if (l) page.drawText(l, { x: 50, y, size: 12, font });
      y -= 22;
    }
  }
  return pdf.save();
}

describe("resume text extraction", () => {
  it("extracts text from a DOCX", async () => {
    const r = await extractResumeBytes(await makeDocx(SINGLE[0]), "resume.docx");
    expect(r.kind).toBe("docx");
    expect(r.text).toContain("Field Technician");
    expect(r.text).toContain("Repaired POS systems and printers");
  });

  it("extracts text from a PDF (serverless pdf.js, no worker needed)", async () => {
    const r = await extractResumeBytes(await makePdf(SINGLE), "resume.pdf");
    expect(r.kind).toBe("pdf");
    expect(r.text).toContain("Field Technician");
    expect(r.text.toLowerCase()).toContain("repaired pos systems");
  });

  it("extracts text from every page of a multi-page PDF", async () => {
    const r = await extractResumeBytes(await makePdf(MULTI_JOB), "resume.pdf");
    expect(r.text).toContain("Field Service Technician"); // page 1
    expect(r.text).toContain("A.A.S. Network Administration"); // page 2
    expect(r.text).toContain("POS Support Technician"); // page 2
  });

  it("supports a PDF resume with multiple jobs (parses >= 2 positions)", async () => {
    const r = await extractResumeBytes(await makePdf(MULTI_JOB), "resume.pdf");
    const parsed = parseResumeText(r.text);
    expect(parsed.positions.length).toBeGreaterThanOrEqual(2);
    expect(parsed.skills.length).toBeGreaterThan(0);
  });

  it("reads plain text / markdown", async () => {
    const r = await extractResumeBytes(new TextEncoder().encode("Hello\nResume"), "r.md");
    expect(r.kind).toBe("text");
    expect(r.text).toContain("Resume");
  });

  it("handles an empty file without throwing", async () => {
    const r = await extractResumeBytes(new Uint8Array(), "r.txt");
    expect(r.text).toBe("");
    expect(r.warning).toBeTruthy();
  });

  it("rejects an unsupported file type", async () => {
    await expect(extractResumeBytes(new Uint8Array([1, 2, 3]), "malware.exe")).rejects.toThrow(/unsupported/i);
  });

  it("reports a malformed PDF honestly — not as a worker/config error, and not a false password claim", async () => {
    try {
      await extractResumeBytes(new TextEncoder().encode("%PDF- not really a pdf"), "broken.pdf");
      throw new Error("expected extraction to throw");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toMatch(/readable PDF|corrupted/i);
      expect(msg).not.toMatch(/password/i);
      expect(msg).not.toMatch(/worker|\.next|module/i);
    }
  });
});
