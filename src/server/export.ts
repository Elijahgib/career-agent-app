import { isRelation } from "@/lib/evidence/relations";
import { db } from "./db";

export const EXPORT_FORMAT = "career-agent-app/profile-export@1";

/** Everything stored about one candidate, as portable JSON (data portability / backup). */
export async function exportProfile(profileId: string) {
  const p = await db.candidateProfile.findUnique({
    where: { id: profileId },
    include: {
      preferences: true,
      positions: true,
      education: true,
      facts: true,
      matches: { select: { jobId: true, tier: true, score: true, userVerdict: true, verdictReason: true, computedAt: true } },
      applications: { include: { events: true, interviews: true } },
      documents: true,
      notifications: true,
      emailSignals: true,
    },
  });
  if (!p) return null;
  const jobIds = [...new Set([...p.applications.map((a) => a.jobId), ...p.documents.map((d) => d.jobId)].filter(Boolean) as string[])];
  const jobs = await db.job.findMany({ where: { id: { in: jobIds } }, include: { sources: true } });
  return { format: EXPORT_FORMAT, exportedAt: new Date().toISOString(), profile: p, jobs };
}

type Exported = NonNullable<Awaited<ReturnType<typeof exportProfile>>>;

function asArray<T>(x: unknown): T[] {
  return Array.isArray(x) ? (x as T[]) : [];
}

/**
 * Validate the shape of an untrusted import before any write, so a malformed file is
 * rejected with a clear message rather than throwing deep in the import or leaving a
 * half-written profile. Returns a normalised view with guaranteed arrays.
 */
export function validateImport(data: unknown): Exported {
  const d = data as Partial<Exported> | null | undefined;
  if (!d || typeof d !== "object") throw new Error("Import file is not valid JSON object.");
  if (d.format !== EXPORT_FORMAT) throw new Error(`Unrecognised export file (expected format "${EXPORT_FORMAT}").`);
  const src = d.profile as Exported["profile"] | undefined;
  if (!src || typeof src !== "object") throw new Error("Export file has no profile data.");
  if (typeof src.displayName !== "string" || !src.displayName.trim()) throw new Error("Export file is missing the candidate name.");
  // Normalise every collection to an array so iteration can't throw on malformed input.
  src.positions = asArray(src.positions);
  src.education = asArray(src.education);
  src.facts = asArray(src.facts);
  src.applications = asArray(src.applications);
  src.documents = asArray(src.documents);
  src.notifications = asArray(src.notifications);
  src.emailSignals = asArray(src.emailSignals);
  (d as Exported).jobs = asArray(d.jobs);
  return d as Exported;
}

/** Import an export as a NEW profile (new ids); jobs are matched by dedupe key. */
export async function importProfile(input: unknown) {
  const data = validateImport(input);
  const src = data.profile;
  const jobMap = new Map<string, string>();
  for (const j of data.jobs ?? []) {
    const existing = await db.job.findUnique({ where: { dedupeKey: j.dedupeKey } });
    if (existing) {
      jobMap.set(j.id, existing.id);
      continue;
    }
    const { id: _id, sources, createdAt: _c, updatedAt: _u, ...rest } = j;
    void _id; void _c; void _u;
    const created = await db.job.create({ data: { ...rest, sources: { create: sources.map(({ id: _sid, jobId: _jid, ...s }) => { void _sid; void _jid; return s; }) } } });
    jobMap.set(j.id, created.id);
  }
  const profile = await db.candidateProfile.create({
    data: {
      displayName: `${src.displayName} (imported)`,
      headline: src.headline,
      email: src.email,
      phone: src.phone,
      city: src.city,
      region: src.region,
      country: src.country,
      links: src.links,
      careerLevel: src.careerLevel,
      isDemo: false,
      nextFactNo: Number.isFinite(src.nextFactNo as number) ? src.nextFactNo : 1,
    },
  });
  try {
  if (src.preferences) {
    const { id: _pid, profileId: _pp, updatedAt: _pu, ...prefs } = src.preferences;
    void _pid; void _pp; void _pu;
    await db.preferences.create({ data: { ...prefs, profileId: profile.id } });
  } else await db.preferences.create({ data: { profileId: profile.id } });
  const posMap = new Map<string, string>();
  for (const pos of src.positions) {
    const { id, profileId: _x, createdAt: _y, ...rest } = pos;
    void _x; void _y;
    const row = await db.position.create({ data: { ...rest, profileId: profile.id } });
    posMap.set(id, row.id);
  }
  for (const e of src.education) {
    const { id: _a, profileId: _b, createdAt: _c2, ...rest } = e;
    void _a; void _b; void _c2;
    await db.education.create({ data: { ...rest, profileId: profile.id } });
  }
  for (const f of src.facts) {
    const { id: _a, profileId: _b, createdAt: _c3, updatedAt: _d, positionId, ...rest } = f;
    void _a; void _b; void _c3; void _d;
    // Imported files are untrusted: keep only valid relationships, and an oversized fact must be re-verified.
    const relations = (() => {
      try {
        const v: unknown = JSON.parse(String(rest.relationsJson ?? "[]"));
        return Array.isArray(v) ? v.filter(isRelation) : [];
      } catch {
        return [];
      }
    })();
    const tooLong = String(rest.canonicalFact ?? "").length > 1000;
    await db.evidenceFact.create({
      data: {
        ...rest,
        canonicalFact: String(rest.canonicalFact ?? "").slice(0, 1000),
        relationsJson: JSON.stringify(relations),
        ...(tooLong ? { verificationStatus: "UNVERIFIED", verifiedAt: null } : {}),
        profileId: profile.id,
        positionId: positionId ? posMap.get(positionId) ?? null : null,
      },
    });
  }
  for (const a of src.applications) {
    const { id: _a, profileId: _b, jobId, events, interviews, createdAt: _c4, updatedAt: _d, ...rest } = a;
    void _a; void _b; void _c4; void _d;
    await db.application.create({
      data: {
        ...rest,
        profileId: profile.id,
        jobId: jobId ? jobMap.get(jobId) ?? null : null,
        events: { create: asArray<(typeof events)[number]>(events).map(({ id: _e, applicationId: _f, ...ev }) => { void _e; void _f; return ev; }) },
        interviews: { create: asArray<(typeof interviews)[number]>(interviews).map(({ id: _g, applicationId: _h, ...iv }) => { void _g; void _h; return iv; }) },
      },
    });
  }
  for (const d of src.documents) {
    const { id: _a, profileId: _b, jobId, ...rest } = d;
    void _a; void _b;
    await db.generatedDocument.create({ data: { ...rest, profileId: profile.id, jobId: jobId ? jobMap.get(jobId) ?? null : null } });
  }
  } catch (e) {
    // A malformed row must never leave a half-written profile behind — roll the whole thing back.
    await db.candidateProfile.delete({ where: { id: profile.id } }).catch(() => {});
    throw new Error(`Import failed and was rolled back: ${(e as Error).message}`);
  }
  return profile;
}
