import Link from "next/link";
import { NoProfile } from "@/components/no-profile";
import { Badge, Card, Empty, PageHeader, Stat, TierBadge, fmtDate } from "@/components/ui";
import { formatSalary } from "@/lib/jobs/normalize";
import { db } from "@/server/db";
import { listNotifications } from "@/server/notifications";
import { getActiveProfileId } from "@/server/session";
import { ACTIVE_PIPELINE } from "@/server/tracker";
import { loadWorkspace } from "@/server/views";

const TIER_RANK: Record<string, number> = { STRONG: 3, GOOD: 2, STRETCH: 1, SKIP: 0 };

export default async function Dashboard() {
  const profileId = await getActiveProfileId();
  if (!profileId) return <NoProfile />;
  const { snapshot, scored, gaps, now } = await loadWorkspace(profileId);
  const [apps, notifications] = await Promise.all([
    db.application.findMany({ where: { profileId }, include: { interviews: true } }),
    listNotifications(profileId, 8),
  ]);
  const live = scored.filter((s) => s.verdict !== "REJECTED" && s.job.status === "ACTIVE");
  const strongest = live
    .filter((s) => s.match.tier !== "SKIP" && s.match.freshness.ageDays <= 14)
    .sort((a, b) => TIER_RANK[b.match.tier] - TIER_RANK[a.match.tier] || b.match.score - a.match.score)
    .slice(0, 5);
  const recent = [...live].sort((a, b) => new Date(b.job.firstSeenAt).getTime() - new Date(a.job.firstSeenAt).getTime()).slice(0, 6);
  const counts = Object.fromEntries(ACTIVE_PIPELINE.map((s) => [s, apps.filter((a) => a.status === s).length]));
  const interviews = apps.flatMap((a) => a.interviews.map((i) => ({ ...i, app: a }))).filter((i) => i.scheduledAt.getTime() >= now.getTime() - 3_600_000).sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
  const followUps = apps.filter((a) => a.followUpAt && ["APPLIED", "SCREEN", "INTERVIEW"].includes(a.status)).sort((a, b) => a.followUpAt!.getTime() - b.followUpAt!.getTime());
  const unverified = snapshot.facts.filter((f) => !f.derived && f.verificationStatus !== "VERIFIED").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hi, ${snapshot.profile.displayName.replace(/\s*\(demo\)$/, "").split(" ")[0]}`}
        subtitle="Find strong-fit jobs early, tailor truthfully, and manage the entire search in one place."
        actions={
          <>
            <Link href="/jobs" className="btn">
              Browse jobs
            </Link>
            <Link href="/evidence" className="btn btn-primary">
              Review evidence
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {ACTIVE_PIPELINE.map((s) => (
          <Stat key={s} label={s.toLowerCase()} value={counts[s] ?? 0} />
        ))}
      </div>

      {unverified > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {unverified} fact{unverified === 1 ? " is" : "s are"} unverified and will not appear in any generated document. <Link href="/evidence?filter=unverified">Review them →</Link>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Strongest fresh matches" subtitle="Posted or first seen in the last 14 days, best tier first.">
          {strongest.length ? (
            <ul className="divide-y divide-line">
              {strongest.map(({ job, match }) => (
                <li key={job.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link href={`/jobs/${job.id}`} className="font-medium">
                      {job.title}
                    </Link>
                    <div className="muted truncate">
                      {job.company} · {job.location ?? "Location n/a"} · {formatSalary(job.salaryMin, job.salaryMax, job.salaryPeriod)}
                    </div>
                    <div className="mt-1 text-xs text-slate-600">{match.summary}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <TierBadge tier={match.tier} score={match.score} />
                    <span className="text-xs text-muted">{match.freshness.label}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No fresh STRONG/GOOD/STRETCH matches yet. Import jobs or add saved sources.</Empty>
          )}
        </Card>

        <Card title="Notifications" actions={<Link href="/notifications">All →</Link>}>
          {notifications.length ? (
            <ul className="space-y-2 text-sm">
              {notifications.map((n) => (
                <li key={n.id} className={n.readAt ? "opacity-60" : ""}>
                  <Badge tone={n.type === "STRONG_MATCH" ? "green" : n.type === "INTERVIEW_REMINDER" ? "purple" : n.type === "FOLLOW_UP" ? "amber" : "blue"}>{n.type.replace("_", " ").toLowerCase()}</Badge>{" "}
                  {n.jobId ? <Link href={`/jobs/${n.jobId}`}>{n.title}</Link> : n.title}
                  <div className="text-xs text-muted">{n.body}</div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nothing new.</Empty>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Upcoming interviews">
          {interviews.length ? (
            <ul className="space-y-2 text-sm">
              {interviews.slice(0, 5).map((i) => (
                <li key={i.id}>
                  <div className="font-medium">{i.app.role}</div>
                  <div className="muted">
                    {i.app.company} · {i.kind.replace("_", " ").toLowerCase()} · {i.scheduledAt.toISOString().slice(0, 16).replace("T", " ")} UTC
                  </div>
                  {i.app.jobId && <Link href={`/interview/${i.app.jobId}`}>Prepare →</Link>}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No interviews scheduled.</Empty>
          )}
        </Card>
        <Card title="Follow-ups">
          {followUps.length ? (
            <ul className="space-y-2 text-sm">
              {followUps.slice(0, 6).map((a) => (
                <li key={a.id} className="flex justify-between gap-2">
                  <span>
                    <Link href={`/tracker#${a.id}`}>{a.role}</Link>
                    <span className="muted"> · {a.company}</span>
                  </span>
                  <Badge tone={a.followUpAt!.getTime() <= now.getTime() + 86_400_000 ? "amber" : "gray"}>{fmtDate(a.followUpAt)}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No follow-ups due.</Empty>
          )}
        </Card>
        <Card title="Recurring skill gaps" actions={<Link href="/skills">Plan →</Link>}>
          {gaps.recommendations.length ? (
            <ol className="space-y-2 text-sm">
              {gaps.recommendations.slice(0, 5).map((g) => (
                <li key={g.conceptId} className="flex items-center justify-between gap-2">
                  <span>{g.label}</span>
                  <span className="text-xs text-muted">
                    {g.frequency} job{g.frequency === 1 ? "" : "s"} · effort {g.effort}/5
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <Empty>No recurring gaps in jobs you&apos;d consider.</Empty>
          )}
        </Card>
      </div>

      <Card title="Recently found jobs" actions={<Link href="/jobs">All jobs →</Link>}>
        <table className="table">
          <thead>
            <tr>
              <th>Role</th>
              <th>Tier</th>
              <th>Freshness</th>
              <th>Hard gaps</th>
            </tr>
          </thead>
          <tbody>
            {recent.map(({ job, match }) => (
              <tr key={job.id}>
                <td>
                  <Link href={`/jobs/${job.id}`}>{job.title}</Link>
                  <div className="text-xs text-muted">{job.company}</div>
                </td>
                <td>
                  <TierBadge tier={match.tier} score={match.score} />
                </td>
                <td className="text-xs">{match.freshness.label}</td>
                <td className="text-xs">{match.counts.hardGaps}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
