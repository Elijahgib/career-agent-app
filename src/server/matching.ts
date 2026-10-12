import type { CandidateSnapshot, JobRecord } from "@/lib/domain/types";
import { MATCH_ENGINE_VERSION, matchJob, type MatchResult } from "@/lib/matching/engine";
import { db } from "./db";
import { analysisFor, listJobRecords } from "./jobs";
import { parseJson } from "./mappers";
import { getSnapshot } from "./profiles";

export interface ScoredJob {
  job: JobRecord;
  match: MatchResult;
  verdict: string | null;
  verdictReason: string | null;
}

/**
 * Score every job for a profile, reusing stored results unless the profile,
 * its evidence, the job or the engine changed since they were computed.
 */
export async function ensureMatches(profileId: string, now = new Date()): Promise<{ snapshot: CandidateSnapshot; scored: ScoredJob[] }> {
  const snapshot = await getSnapshot(profileId);
  if (!snapshot) throw new Error("Profile not found");
  const [jobs, stored, profileRow, latestFact, prefs] = await Promise.all([
    listJobRecords(),
    db.jobMatch.findMany({ where: { profileId } }),
    db.candidateProfile.findUnique({ where: { id: profileId }, select: { updatedAt: true } }),
    db.evidenceFact.findFirst({ where: { profileId }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    db.preferences.findUnique({ where: { profileId }, select: { updatedAt: true } }),
  ]);
  const profileChanged = Math.max(profileRow?.updatedAt.getTime() ?? 0, latestFact?.updatedAt.getTime() ?? 0, prefs?.updatedAt.getTime() ?? 0);
  const jobUpdated = new Map((await db.job.findMany({ select: { id: true, updatedAt: true } })).map((j) => [j.id, j.updatedAt.getTime()]));
  const byJob = new Map(stored.map((m) => [m.jobId, m]));
  const scored: ScoredJob[] = [];
  const dayOld = now.getTime() - 86_400_000;

  for (const job of jobs) {
    const prev = byJob.get(job.id);
    const fresh =
      prev &&
      prev.engineVersion === MATCH_ENGINE_VERSION &&
      prev.computedAt.getTime() >= profileChanged &&
      prev.computedAt.getTime() >= (jobUpdated.get(job.id) ?? 0) &&
      prev.computedAt.getTime() >= dayOld; // freshness component ages daily
    let match: MatchResult;
    if (fresh) match = parseJson<MatchResult>(prev!.resultJson, null as unknown as MatchResult);
    else {
      match = matchJob(snapshot, job, { analysis: analysisFor(job), now });
      await db.jobMatch.upsert({
        where: { profileId_jobId: { profileId, jobId: job.id } },
        create: { profileId, jobId: job.id, tier: match.tier, score: match.score, resultJson: JSON.stringify(match), engineVersion: MATCH_ENGINE_VERSION, computedAt: now },
        update: { tier: match.tier, score: match.score, resultJson: JSON.stringify(match), engineVersion: MATCH_ENGINE_VERSION, computedAt: now },
      });
    }
    scored.push({ job, match, verdict: prev?.userVerdict ?? null, verdictReason: prev?.verdictReason ?? null });
  }
  return { snapshot, scored };
}

export async function setVerdict(profileId: string, jobId: string, verdict: "REJECTED" | null, reason?: string) {
  await db.jobMatch.updateMany({ where: { profileId, jobId }, data: { userVerdict: verdict, verdictReason: reason ?? null } });
}
