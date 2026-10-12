import type { NotificationDraft } from "@/lib/notifications/types";
import { db } from "./db";
import type { ScoredJob } from "./matching";

export async function addNotifications(profileId: string, drafts: NotificationDraft[]) {
  for (const d of drafts) {
    await db.notification.upsert({
      where: { profileId_dedupeKey: { profileId, dedupeKey: d.dedupeKey } },
      create: { profileId, type: d.type, title: d.title, body: d.body, jobId: d.jobId ?? null, applicationId: d.applicationId ?? null, dedupeKey: d.dedupeKey },
      update: {},
    });
  }
}

/** Derive in-app notifications from current matches and tracker dates. Local only. */
export async function refreshNotifications(profileId: string, scored: ScoredJob[], now = new Date()) {
  const drafts: NotificationDraft[] = [];
  for (const { job, match, verdict } of scored) {
    if (verdict === "REJECTED" || job.status !== "ACTIVE") continue;
    if ((match.tier === "STRONG" || match.tier === "GOOD") && match.freshness.ageDays <= 7) {
      drafts.push({
        type: "STRONG_MATCH",
        title: `${match.tier} fresh match: ${job.title}`,
        body: `${job.company} · ${match.freshness.label} · ${match.summary}`,
        jobId: job.id,
        dedupeKey: `match:${job.id}:${match.tier}`,
      });
    }
  }
  const apps = await db.application.findMany({ where: { profileId }, include: { interviews: true } });
  const day = 86_400_000;
  for (const a of apps) {
    if (a.followUpAt && ["APPLIED", "SCREEN", "INTERVIEW"].includes(a.status) && a.followUpAt.getTime() <= now.getTime() + day) {
      drafts.push({ type: "FOLLOW_UP", title: `Follow up: ${a.role}`, body: `${a.company} — follow-up date ${a.followUpAt.toISOString().slice(0, 10)}.`, applicationId: a.id, jobId: a.jobId ?? undefined, dedupeKey: `followup:${a.id}:${a.followUpAt.toISOString().slice(0, 10)}` });
    }
    for (const iv of a.interviews) {
      const until = iv.scheduledAt.getTime() - now.getTime();
      if (until > 0 && until <= 2 * day) {
        drafts.push({ type: "INTERVIEW_REMINDER", title: `Interview soon: ${a.role}`, body: `${a.company} — ${iv.kind.replace("_", " ").toLowerCase()} on ${iv.scheduledAt.toISOString().slice(0, 16).replace("T", " ")} UTC.`, applicationId: a.id, jobId: a.jobId ?? undefined, dedupeKey: `interview:${iv.id}` });
      }
    }
  }
  await addNotifications(profileId, drafts);
}

export async function listNotifications(profileId: string, take = 30) {
  return db.notification.findMany({ where: { profileId }, orderBy: { createdAt: "desc" }, take });
}

export async function unreadCount(profileId: string) {
  return db.notification.count({ where: { profileId, readAt: null } });
}
