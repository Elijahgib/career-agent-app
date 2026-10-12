import { ADAPTERS, safeFetcher, type FetchLike, type SourceType } from "@/lib/sources";
import { db } from "./db";
import { importNormalizedJob } from "./jobs";
import { ensureMatches } from "./matching";
import { addNotifications, refreshNotifications } from "./notifications";

/**
 * Background scan framework: check every enabled saved source, upsert postings,
 * close postings that disappeared from their source, re-score every profile and
 * raise notifications. Run on demand (UI / `npm run scan`) or from any scheduler.
 */
export async function runScan(opts: { trigger?: "MANUAL" | "SCHEDULED"; fetcher?: FetchLike; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const fetcher = opts.fetcher ?? safeFetcher();
  const run = await db.scanRun.create({ data: { trigger: opts.trigger ?? "MANUAL", startedAt: now } });
  const sources = await db.sourceConfig.findMany({ where: { enabled: true } });
  const errors: string[] = [];
  let seen = 0,
    created = 0,
    closed = 0;
  const reactivated: string[] = [];

  for (const src of sources) {
    const adapter = ADAPTERS[src.sourceType as SourceType];
    if (!adapter) continue;
    try {
      const postings = await adapter.list(src.identifier, fetcher);
      const seenIds = new Set<string>();
      for (const n of postings) {
        const r = await importNormalizedJob(n, { now });
        seenIds.add(n.externalId);
        seen++;
        if (r.created) created++;
        if (r.reactivated) reactivated.push(r.jobId);
      }
      // Postings that vanished from this source are closed by the employer.
      const known = await db.jobSource.findMany({ where: { sourceType: src.sourceType, sourceName: src.identifier }, include: { job: true } });
      for (const k of known) {
        if (!seenIds.has(k.externalId) && k.job.status === "ACTIVE") {
          await db.job.update({ where: { id: k.jobId }, data: { status: "CLOSED", closedAt: now } });
          await db.application.updateMany({ where: { jobId: k.jobId, status: { in: ["DISCOVERED", "EVALUATED", "SAVED", "READY"] } }, data: { status: "EMPLOYER_CLOSED", outcome: "EMPLOYER_CLOSED" } });
          closed++;
        }
      }
      await db.sourceConfig.update({ where: { id: src.id }, data: { lastScanAt: now, lastStatus: `OK — ${postings.length} postings`, lastError: null } });
    } catch (e) {
      const msg = (e as Error).message;
      errors.push(`${src.sourceType}:${src.identifier} — ${msg}`);
      await db.sourceConfig.update({ where: { id: src.id }, data: { lastScanAt: now, lastStatus: "ERROR", lastError: msg } });
    }
  }

  const profiles = await db.candidateProfile.findMany({ select: { id: true } });
  for (const p of profiles) {
    const { scored } = await ensureMatches(p.id, now);
    await refreshNotifications(p.id, scored, now);
    if (reactivated.length) {
      const apps = await db.application.findMany({ where: { profileId: p.id, jobId: { in: reactivated } } });
      await addNotifications(p.id, apps.map((a) => ({ type: "JOB_REACTIVATED" as const, title: `Back open: ${a.role}`, body: `${a.company} re-listed a posting you were tracking.`, jobId: a.jobId ?? undefined, applicationId: a.id, dedupeKey: `reactivated:${a.jobId}:${now.toISOString().slice(0, 10)}` })));
    }
  }

  const status = errors.length ? (errors.length === sources.length && sources.length > 0 ? "FAILED" : "PARTIAL") : "SUCCEEDED";
  return db.scanRun.update({
    where: { id: run.id },
    data: { finishedAt: new Date(), status, sourcesJson: JSON.stringify(sources.map((s) => `${s.sourceType}:${s.identifier}`)), jobsSeen: seen, jobsNew: created, jobsClosed: closed, errorsJson: JSON.stringify(errors) },
  });
}
