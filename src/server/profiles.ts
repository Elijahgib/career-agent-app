import type { CandidateSnapshot } from "@/lib/domain/types";
import { buildLedger } from "@/lib/evidence/ledger";
import { db } from "./db";
import { toEducation, toLedgerFact, toPosition, toPreferences, toProfile } from "./mappers";

export async function listProfiles() {
  return db.candidateProfile.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, displayName: true, isDemo: true, careerLevel: true, updatedAt: true } });
}

export async function getProfileRow(id: string) {
  return db.candidateProfile.findUnique({ where: { id }, include: { preferences: true } });
}

/** Everything the engines need for one candidate, with derived ROLE/EDU facts. */
export async function getSnapshot(profileId: string): Promise<CandidateSnapshot | null> {
  const p = await db.candidateProfile.findUnique({
    where: { id: profileId },
    include: { preferences: true, positions: { orderBy: [{ sortOrder: "asc" }, { startDate: "desc" }] }, education: true, facts: { orderBy: { code: "asc" } } },
  });
  if (!p) return null;
  const positions = p.positions.map(toPosition);
  const education = p.education.map(toEducation);
  return {
    profile: toProfile(p),
    preferences: toPreferences(p.preferences),
    positions,
    education,
    facts: buildLedger(p.facts.map(toLedgerFact), positions, education),
  };
}

export async function createProfile(input: { displayName: string; careerLevel?: string; city?: string; region?: string; email?: string; phone?: string }) {
  return db.candidateProfile.create({
    data: {
      displayName: input.displayName,
      careerLevel: input.careerLevel ?? "EARLY",
      city: input.city || null,
      region: input.region || null,
      email: input.email || null,
      phone: input.phone || null,
      country: "US",
      preferences: { create: {} },
    },
  });
}

/** Allocate the next FACT-### code for a profile (atomic increment). */
export async function nextFactCode(profileId: string): Promise<string> {
  const p = await db.candidateProfile.update({ where: { id: profileId }, data: { nextFactNo: { increment: 1 } }, select: { nextFactNo: true } });
  return `FACT-${String(p.nextFactNo - 1).padStart(3, "0")}`;
}

export async function touchProfile(profileId: string) {
  await db.candidateProfile.update({ where: { id: profileId }, data: { updatedAt: new Date() } });
}

export async function deleteProfile(profileId: string) {
  // Cascades remove preferences, positions, education, facts, matches,
  // applications (+ events, interviews), documents, notifications and email signals.
  await db.candidateProfile.delete({ where: { id: profileId } });
}
