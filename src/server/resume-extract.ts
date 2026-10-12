// Local, offline text extraction from resume files. No network, no AI — the bytes never
// leave this machine. PDF via unpdf (a serverless pdf.js build that runs in Node with NO web
// worker, so it works under Next/Turbopack with no worker-module lookup); DOCX via mammoth.

export type ResumeKind = "pdf" | "docx" | "text";

export interface ExtractResult {
  text: string;
  kind: ResumeKind;
  warning?: string;
}

const MAX_BYTES = 10_000_000; // 10 MB

function extByName(name: string): ResumeKind | null {
  const n = name.toLowerCase();
  if (n.endsWith(".pdf")) return "pdf";
  if (n.endsWith(".docx")) return "docx";
  if (n.endsWith(".txt") || n.endsWith(".md") || n.endsWith(".markdown")) return "text";
  return null;
}

async function extractPdf(bytes: Uint8Array): Promise<string> {
  // unpdf's getDocumentProxy loads the serverless pdf.js build — fully in-process, no worker,
  // no dynamic worker-module import (which is what broke under Next/Turbopack).
  const { getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(bytes);
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // pdf.js returns positioned fragments; rebuild lines by rounded Y. A LARGE horizontal gap
    // between fragments means separate columns (two-column skills, or a right-aligned date), so
    // insert a TAB there — the parser uses it to split columns that would otherwise merge.
    const rows = new Map<number, { x: number; w: number; h: number; s: string }[]>();
    for (const item of content.items as Array<{ str?: string; transform?: number[]; width?: number; height?: number }>) {
      if (typeof item.str !== "string" || !item.transform) continue;
      const y = Math.round(item.transform[5]);
      (rows.get(y) ?? rows.set(y, []).get(y)!).push({ x: item.transform[4], w: item.width ?? 0, h: item.height ?? 11, s: item.str });
    }
    const lines = [...rows.entries()]
      .sort((a, b) => b[0] - a[0]) // top of page first (PDF origin is bottom-left)
      .map(([, frags]) => {
        // pdf.js often emits a wide whitespace-only item to span a column gap; ignore those and
        // measure the gap between the TEXT fragments themselves so columns don't merge.
        const text = frags.filter((f) => f.s.trim().length > 0).sort((a, b) => a.x - b.x);
        let out = "";
        for (let k = 0; k < text.length; k++) {
          const f = text[k];
          if (k > 0) {
            const prev = text[k - 1];
            const gap = f.x - (prev.x + prev.w);
            out += gap > Math.max(14, f.h || 11) ? "\t" : " ";
          }
          out += f.s;
        }
        return out.replace(/[  ]+/g, " ").replace(/ *\t+ */g, "\t").trim();
      })
      .filter(Boolean);
    pages.push(lines.join("\n"));
  }
  return pages.join("\n");
}

async function extractDocx(bytes: Uint8Array): Promise<string> {
  const mod = await import("mammoth");
  const mammoth = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const res = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return res.value;
}

/** Lower-level extraction from raw bytes (test-friendly). */
export async function extractResumeBytes(bytes: Uint8Array, filename: string, mime?: string): Promise<ExtractResult> {
  if (bytes.length === 0) return { text: "", kind: "text", warning: "The file is empty." };
  if (bytes.length > MAX_BYTES) throw new Error("File is too large (10 MB limit).");
  const kind = extByName(filename) ?? (mime === "application/pdf" ? "pdf" : mime?.includes("word") ? "docx" : mime?.startsWith("text/") ? "text" : null);
  if (!kind) throw new Error("Unsupported file type. Upload a PDF, DOCX, TXT, or MD file.");
  try {
    if (kind === "pdf") return { text: await extractPdf(bytes), kind };
    if (kind === "docx") return { text: await extractDocx(bytes), kind };
    return { text: new TextDecoder().decode(bytes), kind: "text" };
  } catch (e) {
    const err = e as Error;
    const msg = err.message ?? String(e);
    if (kind === "pdf") {
      // Only blame the user's file when the parser actually says it's password-protected or invalid.
      if (err.name === "PasswordException" || /password/i.test(msg)) {
        throw new Error("This PDF is password-protected. Remove the password (or print it to a new PDF) and try again, or paste the text instead.");
      }
      if (err.name === "InvalidPDFException" || /invalid pdf|corrupt|bad pdf|not a pdf/i.test(msg)) {
        throw new Error("This file doesn't look like a readable PDF — it may be corrupted. Try re-exporting it, or paste the text instead.");
      }
      // Anything else (a worker/module/config/runtime problem) is NOT the user's file — say so plainly.
      throw new Error(`PDF text extraction failed internally: ${msg}. This isn't a problem with your file — please paste the resume text while this is looked into.`);
    }
    if (kind === "docx") throw new Error(`Could not read the DOCX file (it may be corrupted): ${msg}`);
    throw new Error(`Could not read the file: ${msg}`);
  }
}

export async function extractResumeText(file: File): Promise<ExtractResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return extractResumeBytes(bytes, file.name, file.type);
}
