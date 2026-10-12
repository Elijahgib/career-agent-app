import { db } from "./db";
import { formatSalary } from "@/lib/jobs/normalize";

export const STATUSES = ["DISCOVERED", "EVALUATED", "SAVED", "READY", "APPLIED", "SCREEN", "INTERVIEW", "OFFER", "REJECTED", "EMPLOYER_CLOSED", "SKIP"] as const;
export type AppStatus = (typeof STATUSES)[number];

export const ACTIVE_PIPELINE: AppStatus[] = ["SAVED", "READY", "APPLIED", "SCREEN", "INTERVIEW", "OFFER"];

export async function ensureApplication(profileId: string, jobId: string, status: AppStatus = "SAVED", actor = "USER") {
  const existing = await db.application.findUnique({ where: { profileId_jobId: { profileId, jobId } } });
  if (existing) return existing;
  const job = await db.job.findUnique({ where: { id: jobId }, include: { sources: { orderBy: { firstSeenAt: "asc" }, take: 1 } } });
  if (!job) throw new Error("Job not found");
  return db.application.create({
    data: {
      profileId,
      jobId,
      status,
      company: job.company,
      role: job.title,
      reqId: job.reqId,
      source: job.sources[0] ? `${job.sources[0].sourceType.toLowerCase()}:${job.sources[0].sourceName}` : null,
      url: job.applyUrl,
      salaryText: job.salaryMin || job.salaryMax ? formatSalary(job.salaryMin, job.salaryMax, job.salaryPeriod as "YEAR" | "HOUR" | null) : null,
      location: job.location,
      events: { create: { toStatus: status, actor, note: "Added to tracker" } },
    },
  });
}

export async function changeStatus(profileId: string, applicationId: string, to: AppStatus, note?: string, actor = "USER") {
  const app = await db.application.findFirst({ where: { id: applicationId, profileId } });
  if (!app) throw new Error("Application not found");
  if (app.status === to && !note) return app;
  const now = new Date();
  const data: Record<string, unknown> = { status: to };
  if (to === "APPLIED" && !app.appliedAt) {
    data.appliedAt = now;
    if (!app.followUpAt) data.followUpAt = new Date(now.getTime() + 7 * 86_400_000);
  }
  if (["REJECTED", "OFFER", "EMPLOYER_CLOSED", "SKIP"].includes(to)) data.outcome = to;
  await db.application.update({ where: { id: applicationId }, data });
  await db.applicationEvent.create({ data: { applicationId, fromStatus: app.status, toStatus: to, note: note || null, actor } });
  return db.application.findUnique({ where: { id: applicationId } });
}

export async function listApplications(profileId: string) {
  return db.application.findMany({
    where: { profileId },
    include: { interviews: { orderBy: { scheduledAt: "asc" } }, events: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { updatedAt: "desc" },
  });
}
