// Acceptance fixture reproducing the REAL PDF extraction layout that previously defeated the
// parser (anonymized data): employer + right-aligned date on ONE row, title and location on the
// rows BELOW, duty bullets WRAPPED across visual lines, two-column CORE COMPETENCIES, a separate
// SKILLS section with duplicates, and a credential + right-aligned year. Builds a real PDF and
// runs it through the actual extractor + parser.
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { parseResumeText } from "@/lib/resume/parse";
import { extractResumeBytes } from "@/server/resume-extract";

async function buildResumePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([612, 792]);
  let y = 752;
  const line = (s: string, x = 50) => { page.drawText(s, { x, y, size: 11, font }); y -= 15; };
  const row = (l: string, r: string, rx = 430) => { page.drawText(l, { x: 50, y, size: 11, font }); page.drawText(r, { x: rx, y, size: 11, font }); y -= 15; };
  const hdr = (s: string) => { page.drawText(s, { x: 50, y, size: 12, font: bold }); y -= 18; };
  const gap = () => { y -= 6; };

  line("Jamie Doe");
  line("St. Louis, MO | jamie.doe@example.com | (314) 555-0100");
  gap();
  hdr("EXPERIENCE");
  row("Globex Retail Systems", "Nov 2024 - Present"); line("Customer Engineer"); line("St. Louis, MO");
  line("Diagnose and repair point-of-sale and self-checkout", 60); line("hardware across multiple retail sites.", 60);
  line("Own service tickets end to end, keeping records accurate,", 60); line("and close each ticket cleanly.", 60);
  line("Coordinate parts and schedules to meet service targets.", 60); gap();
  row("Volt Electrical Services", "Aug 2023 - Mar 2024"); line("Com Tech 1"); line("St. Louis, MO");
  line("Pull and terminate low-voltage and data cabling for new", 60); line("commercial builds.", 60);
  line("Test and label network drops and document runs.", 60); gap();
  row("Brightwave Communications", "Feb 2022 - Nov 2022"); line("Field Technician 2"); line("St. Louis, MO");
  line("Install residential internet and television equipment.", 60); line("Troubleshoot signal issues at the demarcation point.", 60); gap();
  hdr("CORE COMPETENCIES");
  const sr = (a: string, b: string) => { page.drawText(a, { x: 50, y, size: 11, font }); page.drawText(b, { x: 330, y, size: 11, font }); y -= 15; };
  sr("Hardware and Peripheral Troubleshooting", "Printer Support");
  sr("Network Troubleshooting", "Service Ticket Management");
  sr("Asset and Service Records", "Low-Voltage and Data Cabling");
  sr("Connectivity Troubleshooting", "Networking Hardware"); gap();
  hdr("SKILLS");
  line("Microsoft Excel, Word, PowerPoint");
  line("Service Ticketing Software, Documentation and Reporting");
  line("Printer Support, network troubleshooting"); // duplicates + case variant
  gap();
  hdr("EDUCATION");
  row("Certificate in Welding and Fabrication", "2023", 460); line("Example Technical College"); line("St. Louis, MO");
  return pdf.save();
}

describe("real-layout PDF resume (acceptance)", () => {
  it("extracts exactly 3 roles / 7 bullets / 1 education / 13 skills / 0 certs", async () => {
    const { text } = await extractResumeBytes(await buildResumePdf(), "resume.pdf");
    const r = parseResumeText(text);

    expect(r.positions.map((p) => p.employer)).toEqual(["Globex Retail Systems", "Volt Electrical Services", "Brightwave Communications"]);
    expect(r.positions.map((p) => p.title)).toEqual(["Customer Engineer", "Com Tech 1", "Field Technician 2"]);
    expect(r.positions.map((p) => p.startDate)).toEqual(["2024-11", "2023-08", "2022-02"]);
    expect(r.positions.map((p) => p.endDate)).toEqual([null, "2024-03", "2022-11"]);
    expect(r.positions.every((p) => p.location === "St. Louis, MO")).toBe(true);
    expect(r.positions.map((p) => p.bullets.length)).toEqual([3, 2, 2]);
    expect(r.positions.reduce((s, p) => s + p.bullets.length, 0)).toBe(7);

    expect(r.education).toHaveLength(1);
    expect(r.education[0].credential).toBe("Certificate in Welding and Fabrication");
    expect(r.education[0].institution).toBe("Example Technical College");
    expect(r.education[0].endDate).toBe("2023-01");

    expect(r.skills).toHaveLength(13);
    expect(r.skills).toEqual(expect.arrayContaining(["Hardware and Peripheral Troubleshooting", "Low-Voltage and Data Cabling", "Microsoft Excel", "Documentation and Reporting"]));
    expect(r.certifications).toHaveLength(0);
  });

  it("never turns a duty sentence into an employer, and merges wrapped bullets", async () => {
    const { text } = await extractResumeBytes(await buildResumePdf(), "resume.pdf");
    const r = parseResumeText(text);
    for (const p of r.positions) {
      expect(p.employer!.length).toBeLessThan(40);
      expect(p.employer!.endsWith(".")).toBe(false); // a sentence would end with a period
      expect(p.title!.length).toBeLessThan(40);
    }
    // wrapped duty merged into one bullet
    expect(r.positions[0].bullets[0]).toBe("Diagnose and repair point-of-sale and self-checkout hardware across multiple retail sites.");
  });

  it("does not create merged two-column skills", async () => {
    const { text } = await extractResumeBytes(await buildResumePdf(), "resume.pdf");
    const r = parseResumeText(text);
    expect(r.skills).not.toContain("Asset and Service Records Low-Voltage and Data Cabling");
  });
});
