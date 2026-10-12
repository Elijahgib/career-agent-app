import Link from "next/link";
import { NoProfile } from "@/components/no-profile";
import { Badge, Card, Empty, PageHeader, fmtDate } from "@/components/ui";
import { listNotifications } from "@/server/notifications";
import { getActiveProfileId } from "@/server/session";
import { markAllReadAction } from "../actions";

export default async function NotificationsPage() {
  const profileId = await getActiveProfileId();
  if (!profileId) return <NoProfile />;
  const items = await listNotifications(profileId, 100);
  return (
    <div className="space-y-6">
      <PageHeader title="Notifications" subtitle="In-app only. Nothing is emailed or pushed anywhere." actions={<form action={markAllReadAction}><button className="btn btn-sm">Mark all read</button></form>} />
      <Card>
        {items.length ? (
          <ul className="divide-y divide-line">
            {items.map((n) => (
              <li key={n.id} className={`py-2 text-sm ${n.readAt ? "opacity-60" : ""}`}>
                <div className="flex items-center gap-2">
                  <Badge tone={n.type === "STRONG_MATCH" ? "green" : n.type === "INTERVIEW_REMINDER" ? "purple" : n.type === "FOLLOW_UP" ? "amber" : n.type === "JOB_REACTIVATED" ? "teal" : "blue"}>{n.type.toLowerCase().replace("_", " ")}</Badge>
                  {n.jobId ? <Link href={`/jobs/${n.jobId}`}>{n.title}</Link> : n.applicationId ? <Link href={`/tracker#${n.applicationId}`}>{n.title}</Link> : n.title}
                  <span className="ml-auto text-xs text-muted">{fmtDate(n.createdAt)}</span>
                </div>
                <div className="text-xs text-muted">{n.body}</div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No notifications.</Empty>
        )}
      </Card>
    </div>
  );
}
