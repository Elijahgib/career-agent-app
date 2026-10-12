import type { ParsedResume } from "@/lib/resume/parse";
import { diffPositions, type ExistingPosition, type PositionDiff } from "@/lib/resume/diff";
import { db } from "./db";
import { nextFactCode } from "./profiles";

const norm = (s?: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export async function stashPendingImport(profileId: string, parsed: ParsedResume, filename?: string) {
  const json = JSON.stringify(parsed);
  await db.pendingImport.upsert({
    where: { profileId },
    create: { profileId, json, filename: filename ?? null },
    update: { json, filename: filename ?? null, createdAt: new Date() },
  });
}

export async function clearPendingImport(profileId: string) {
  await db.pendingImport.deleteMany({ where: { profileId } });
}

async function existingPositions(profileId: string): Promise<ExistingPosition[]> {
  const rows = await db.position.findMany({ where: { profileId }, select: { id: true, employer: true, title: true, startDate: true, endDate: true } });
  return rows.map((r) => ({ id: r.id, employer: r.employer, title: r.title, startDate: r.startDate, endDate: r.endDate }));
}

export interface PendingDiff {
  diffs: PositionDiff[];
  parsed: ParsedResume;
  filename: string | null;
  /** How many education / skills / certifications are NEW (not already in the profile). */
  newEducation: number;
  newSkills: number;
  newCertifications: number;
}

export async function computePendingDiff(profileId: string): Promise<PendingDiff | null> {
  const p = await db.pendingImport.findUnique({ where: { profileId } });
  if (!p) return null;
  let parsed: ParsedResume;
  try { parsed = JSON.parse(p.json) as ParsedResume; } catch { return null; }
  const diffs = diffPositions(parsed.positions, await existingPositions(profileId));

  const eduKeys = new Set((await db.education.findMany({ where: { profileId }, select: { credential: true, institution: true } })).map((e) => `${norm(e.credential)}|${norm(e.institution)}`));
  const newEducation = parsed.education.filter((e) => e.credential && !eduKeys.has(`${norm(e.credential)}|${norm(e.institution)}`)).length;
  const factTexts = async (category: string) => new Set((await db.evidenceFact.findMany({ where: { profileId, category }, select: { canonicalFact: true } })).map((f) => norm(f.canonicalFact)));
  const haveSkills = await factTexts("SKILL");
  const haveCerts = await factTexts("CERTIFICATION");
  const newSkills = parsed.skills.filter((s) => !haveSkills.has(norm(s))).length;
  const newCertifications = parsed.certifications.filter((c) => !haveCerts.has(norm(c))).length;

  return { diffs, parsed, filename: p.filename, newEducation, newSkills, newCertifications };
}

export interface MergeResult { added: number; updated: number; skipped: number; bulletsAdded: number; education: number; skills: number; certifications: number }

/** Apply only the incoming roles the user approved (by index), plus merge new education/skills/certs. */
export async function applyPendingImport(profileId: string, approved: Set<number>): Promise<MergeResult> {
  const pending = await computePendingDiff(profileId);
  if (!pending) return { added: 0, updated: 0, skipped: 0, bulletsAdded: 0, education: 0, skills: 0, certifications: 0 };
  const { diffs, parsed } = pending;
  const res: MergeResult = { added: 0, updated: 0, skipped: 0, bulletsAdded: 0, education: 0, skills: 0, certifications: 0 };

  const addFact = async (text: string, category: string, source: string, extra: Record<string, unknown> = {}) => {
    await db.evidenceFact.create({ data: { profileId, code: await nextFactCode(profileId), category, experienceType: "PROFESSIONAL", canonicalFact: text, source, verificationStatus: "UNVERIFIED", confidence: "LOW", ...extra } });
  };
  const bulletsForPosition = async (positionId: string | null, context: string | null, roleContext: string | null, bullets: string[]) => {
    const existingTexts = positionId ? new Set((await db.evidenceFact.findMany({ where: { profileId, positionId }, select: { canonicalFact: true } })).map((f) => norm(f.canonicalFact))) : new Set<string>();
    for (const b of bullets) {
      if (existingTexts.has(norm(b))) continue; // never duplicate an existing bullet
      await addFact(b, "DUTY", "Imported resume — needs review", { positionId, context, roleContext });
      res.bulletsAdded++;
    }
  };

  for (let i = 0; i < diffs.length; i++) {
    const d = diffs[i];
    if (!approved.has(i) || d.status === "UNCHANGED") { res.skipped++; continue; }
    const inc = d.incoming;

    if (d.status === "UPDATED" && d.existingId) {
      await db.position.update({
        where: { id: d.existingId },
        data: {
          ...(inc.title ? { title: inc.title } : {}),
          ...(inc.startDate ? { startDate: inc.startDate } : {}),
          endDate: inc.endDate ?? null,
          ...(inc.location ? { location: inc.location } : {}),
          verificationStatus: "UNVERIFIED", // changed details must be re-verified
        },
      });
      const pos = await db.position.findUnique({ where: { id: d.existingId }, select: { employer: true, title: true } });
      await bulletsForPosition(d.existingId, pos?.employer ?? null, pos?.title ?? null, inc.bullets);
      res.updated++;
      continue;
    }

    // NEW or an approved POSSIBLE_DUPLICATE → create a fresh role.
    if (inc.employer && inc.title && inc.startDate) {
      const pos = await db.position.create({ data: { profileId, employer: inc.employer, title: inc.title, location: inc.location ?? null, startDate: inc.startDate, endDate: inc.endDate ?? null, verificationStatus: "UNVERIFIED" } });
      await bulletsForPosition(pos.id, pos.employer, pos.title, inc.bullets);
    } else {
      await bulletsForPosition(null, null, inc.title ?? null, inc.bullets);
    }
    res.added++;
  }

  // Merge education not already present (by credential + institution).
  const existingEdu = new Set((await db.education.findMany({ where: { profileId }, select: { credential: true, institution: true } })).map((e) => `${norm(e.credential)}|${norm(e.institution)}`));
  for (const e of parsed.education) {
    if (!e.credential) continue;
    const key = `${norm(e.credential)}|${norm(e.institution)}`;
    if (existingEdu.has(key)) continue;
    const level = /\b(doctor|ph\.?d)\b/i.test(e.credential) ? "DOCTORATE" : /\b(master|m\.?s|m\.?a|mba)\b/i.test(e.credential) ? "MASTER" : /\b(bachelor|b\.?s|b\.?a)\b/i.test(e.credential) ? "BACHELOR" : /\b(associate|a\.?a|a\.?s)\b/i.test(e.credential) ? "ASSOCIATE" : "CERTIFICATE";
    await db.education.create({ data: { profileId, institution: e.institution ?? "(unknown — from resume)", credential: e.credential, field: e.field ?? null, gpa: e.gpa ?? null, honors: e.honors ?? null, level, endDate: e.endDate ?? null, verificationStatus: "UNVERIFIED" } });
    existingEdu.add(key);
    res.education++;
  }

  // Merge new skills / certifications (dedupe by text against existing facts of the same kind).
  const factTexts = async (category: string) => new Set((await db.evidenceFact.findMany({ where: { profileId, category }, select: { canonicalFact: true } })).map((f) => norm(f.canonicalFact)));
  const haveSkills = await factTexts("SKILL");
  for (const s of parsed.skills) { if (haveSkills.has(norm(s))) continue; await addFact(s, "SKILL", "Imported resume (skill list) — classify & verify"); haveSkills.add(norm(s)); res.skills++; }
  const haveCerts = await factTexts("CERTIFICATION");
  for (const c of parsed.certifications) { if (haveCerts.has(norm(c))) continue; await addFact(c, "CERTIFICATION", "Imported resume — needs review"); haveCerts.add(norm(c)); res.certifications++; }

  await clearPendingImport(profileId);
  return res;
}
