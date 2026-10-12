import Link from "next/link";
import { NoProfile } from "@/components/no-profile";
import { Badge, Card, Empty, PageHeader, TierBadge } from "@/components/ui";
import { db } from "@/server/db";
import { getActiveProfileId } from "@/server/session";

export default async function InterviewIndex() {
  const profileId = await getActiveProfileId();
  if (!profileId) return <NoProfile />;
  const apps = await db.application.findMany({ where: { profileId, jobId: { not: null } }, include: { interviews: true }, orderBy: { updatedAt: "desc" } });
  const matches = await db.jobMatch.findMany({ where: { profileId, tier: { in: ["STRONG", "GOOD"] }, userVerdict: null }, include: { job: { select: { id: true, title: true, company: true } } }, orderBy: { score: "desc" }, take: 8 });
  return (
    <div className="space-y-6">
      <PageHeader title="Interview prep" subtitle="Questions, STAR stories and honest answers built only from your verified history." />
      <Card title="From your tracker">
        {apps.length ? (
          <ul className="divide-y divide-line">
            {apps.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  <Link href={`/interview/${a.jobId}`} className="font-medium">{a.role}</Link> <span className="muted">· {a.company}</span>
                </span>
                <span className="flex gap-1">
                  <Badge tone={a.status === "INTERVIEW" ? "purple" : "gray"}>{a.status.toLowerCase()}</Badge>
                  {a.interviews.length > 0 && <Badge tone="purple">{a.interviews.length} scheduled</Badge>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No tracked applications yet.</Empty>
        )}
      </Card>
      <Card title="Top matches you could prepare for">
        <ul className="divide-y divide-line">
          {matches.map((m) => (
            <li key={m.id} className="flex items-center justify-between py-2 text-sm">
              <Link href={`/interview/${m.job.id}`}>{m.job.title} <span className="muted">· {m.job.company}</span></Link>
              <TierBadge tier={m.tier} score={m.score} />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
