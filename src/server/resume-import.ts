import type { ParsedResume } from "@/lib/resume/parse";
import { db } from "./db";
import { nextFactCode } from "./profiles";

export interface ImportResult {
  positions: number;
  education: number;
  skills: number;
  certifications: number;
  duties: number;
  otherFacts: number;
  prefilled: string[];
  warnings: string[];
}

/** Classify an education level from the explicit credential text (no content invented). */
function levelOf(credential: string): string {
  const c = credential.toLowerCase();
  if (/\b(doctor|ph\.?d)\b/.test(c)) return "DOCTORATE";
  if (/\b(master|m\.?s\.?|m\.?a\.?|m\.?b\.?a)\b/.test(c)) return "MASTER";
  if (/\b(bachelor|b\.?s\.?|b\.?a\.?)\b/.test(c)) return "BACHELOR";
  if (/\b(associate|a\.?a\.?s|a\.?a\.?|a\.?s\.?)\b/.test(c)) return "ASSOCIATE";
  if (/\b(high school|ged|diploma)\b/.test(c)) return "HIGH_SCHOOL";
  return "CERTIFICATE";
}

/**
 * Import a parsed resume as UNVERIFIED candidate data for review. Nothing here is trusted:
 * every fact is UNVERIFIED with LOW confidence, so it cannot authorize a generated claim until
 * the user verifies it, and it can never bypass the Truth Gate.
 */
export async function importParsedResume(profileId: string, parsed: ParsedResume): Promise<ImportResult> {
  const profile = await db.candidateProfile.findUnique({ where: { id: profileId } });
  if (!profile) throw new Error("Profile not found");

  // Prefill only EMPTY identity fields; never overwrite what the user already entered.
  const prefilled: string[] = [];
  const update: Record<string, unknown> = {};
  if (parsed.contact.name && (!profile.displayName || profile.displayName === "Unnamed candidate")) { update.displayName = parsed.contact.name; prefilled.push("name"); }
  if (parsed.contact.email && !profile.email) { update.email = parsed.contact.email; prefilled.push("email"); }
  if (parsed.contact.phone && !profile.phone) { update.phone = parsed.contact.phone; prefilled.push("phone"); }
  if (parsed.contact.location && !profile.city) {
    const [city, region] = parsed.contact.location.split(",").map((s) => s.trim());
    update.city = city;
    if (region) update.region = region;
    prefilled.push("location");
  }
  if (parsed.contact.linkedin) {
    const links = (() => { try { const v = JSON.parse(profile.links || "[]"); return Array.isArray(v) ? v.map(String) : []; } catch { return []; } })();
    if (!links.includes(parsed.contact.linkedin)) { links.push(parsed.contact.linkedin); update.links = JSON.stringify(links); prefilled.push("linkedin"); }
  }
  if (Object.keys(update).length) await db.candidateProfile.update({ where: { id: profileId }, data: update });

  const result: ImportResult = { positions: 0, education: 0, skills: 0, certifications: 0, duties: 0, otherFacts: 0, prefilled, warnings: parsed.warnings };

  const addFact = async (canonicalFact: string, category: string, source: string, extra: Record<string, unknown> = {}) => {
    await db.evidenceFact.create({
      data: { profileId, code: await nextFactCode(profileId), category, experienceType: "PROFESSIONAL", canonicalFact, source, verificationStatus: "UNVERIFIED", confidence: "LOW", ...extra },
    });
  };

  for (const p of parsed.positions) {
    // Create a Position only when employer, title and a start date are all present — so we
    // never fabricate an employer, title or timeline. Otherwise its bullets become facts.
    let positionId: string | null = null;
    let context: string | null = null;
    let roleContext: string | null = p.title ?? null;
    if (p.employer && p.title && p.startDate) {
      const pos = await db.position.create({
        data: { profileId, employer: p.employer, title: p.title, location: p.location ?? null, startDate: p.startDate, endDate: p.endDate ?? null, verificationStatus: "UNVERIFIED" },
      });
      positionId = pos.id;
      context = pos.employer;
      roleContext = pos.title;
      result.positions++;
    }
    for (const b of p.bullets) {
      await addFact(b, "DUTY", "Imported resume — needs review", { positionId, context, roleContext });
      result.duties++;
    }
  }

  for (const e of parsed.education) {
    if (!e.credential) continue;
    await db.education.create({
      data: { profileId, institution: e.institution ?? "(unknown — from resume)", credential: e.credential, field: e.field ?? null, gpa: e.gpa ?? null, honors: e.honors ?? null, level: levelOf(e.credential), endDate: e.endDate ?? null, verificationStatus: "UNVERIFIED" },
    });
    result.education++;
  }

  for (const s of parsed.skills) {
    await addFact(s, "SKILL", "Imported resume (skill list) — classify & verify");
    result.skills++;
  }
  for (const c of parsed.certifications) {
    await addFact(c, "CERTIFICATION", "Imported resume — needs review");
    result.certifications++;
  }
  for (const b of parsed.otherBullets) {
    await addFact(b, "DUTY", "Imported resume — needs review");
    result.otherFacts++;
  }

  return result;
}
