import { resolveProvider } from "@/lib/ai";
import { generateCoverLetter } from "@/lib/documents/cover-letter";
import { renderText } from "@/lib/documents/render";
import { generateResume } from "@/lib/documents/resume";
import type { DocumentKind, GeneratedDocument } from "@/lib/documents/types";
import { generateInterviewPrep, type InterviewPrep } from "@/lib/interview/prep";
import { analyzeJob } from "@/lib/jobs/analyze";
import { validateClaims } from "@/lib/truth-gate/gate";
import { db } from "./db";
import { getJob } from "./jobs";
import { parseJson } from "./mappers";
import { getSnapshot } from "./profiles";

async function nextVersion(profileId: string, jobId: string | null, kind: DocumentKind) {
  const count = await db.generatedDocument.count({ where: { profileId, jobId, kind } });
  return count + 1;
}

async function persist(profileId: string, jobId: string | null, doc: GeneratedDocument) {
  const version = await nextVersion(profileId, jobId, doc.kind);
  return db.generatedDocument.create({
    data: {
      profileId,
      jobId,
      kind: doc.kind,
      version,
      title: doc.title,
      status: doc.gate.status,
      provider: doc.meta.provider,
      contentJson: JSON.stringify({ ...doc, gate: undefined }),
      renderedText: renderText(doc),
      gateJson: JSON.stringify(doc.gate),
      engineVersion: doc.meta.engineVersion,
    },
  });
}

export async function generateAndStore(profileId: string, jobId: string, kind: "RESUME" | "COVER_LETTER", opts: { useAi?: boolean } = {}) {
  const [snapshot, job] = await Promise.all([getSnapshot(profileId), getJob(jobId)]);
  if (!snapshot || !job) throw new Error("Profile or job not found");
  if (kind === "RESUME") {
    const { provider } = resolveProvider();
    const doc = await generateResume(snapshot, job, { provider: opts.useAi ? provider : undefined });
    return persist(profileId, jobId, doc);
  }
  const latestResume = await db.generatedDocument.findFirst({ where: { profileId, jobId, kind: "RESUME" }, orderBy: { version: "desc" } });
  const bullets = latestResume ? parseJson<GeneratedDocument | null>(latestResume.contentJson, null)?.claims.filter((c) => c.section === "experience").map((c) => c.text) : [];
  return persist(profileId, jobId, generateCoverLetter(snapshot, job, { resumeBullets: bullets }));
}

export interface StoredDocument {
  id: string;
  kind: DocumentKind;
  version: number;
  title: string;
  status: string;
  provider: string;
  createdAt: Date;
  jobId: string | null;
  doc: GeneratedDocument;
}

export async function loadDocument(id: string, profileId: string): Promise<StoredDocument | null> {
  const row = await db.generatedDocument.findFirst({ where: { id, profileId } });
  if (!row) return null;
  const content = parseJson<GeneratedDocument>(row.contentJson, null as unknown as GeneratedDocument);
  return { id: row.id, kind: row.kind as DocumentKind, version: row.version, title: row.title, status: row.status, provider: row.provider, createdAt: row.createdAt, jobId: row.jobId, doc: { ...content, gate: parseJson(row.gateJson, content.gate) } };
}

/**
 * A user edit creates a new version and is re-validated. Unsupported edits are
 * saved as BLOCKED with the offending phrase explained — never silently passed.
 */
export async function editClaim(profileId: string, documentId: string, claimId: string, text: string) {
  const stored = await loadDocument(documentId, profileId);
  if (!stored) throw new Error("Document not found");
  const snapshot = await getSnapshot(profileId);
  const job = stored.jobId ? await getJob(stored.jobId) : null;
  if (!snapshot) throw new Error("Profile not found");
  const claims = stored.doc.claims.map((c) => (c.id === claimId ? { ...c, text: text.trim(), origin: "user" as const, segments: undefined, kind: c.kind === "BRIDGE" || c.kind === "HONEST_GAP" ? ("SKILL" as const) : c.kind } : c));
  const gate = validateClaims(claims, { facts: snapshot.facts, job: job ? { title: job.title, company: job.company, requirementConceptIds: analyzeJob(job).requirements.map((r) => r.conceptId) } : null });
  const doc: GeneratedDocument = { ...stored.doc, claims, gate, meta: { ...stored.doc.meta, generatedAt: new Date().toISOString(), provider: `${stored.doc.meta.provider}+edit` } };
  return persist(profileId, stored.jobId, doc);
}

export async function generatePrep(profileId: string, jobId: string): Promise<InterviewPrep> {
  const [snapshot, job] = await Promise.all([getSnapshot(profileId), getJob(jobId)]);
  if (!snapshot || !job) throw new Error("Profile or job not found");
  return generateInterviewPrep(snapshot, job);
}
