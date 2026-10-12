import Link from "next/link";
import { NoProfile } from "@/components/no-profile";
import { Card, Empty, GateBadge, PageHeader, fmtDate } from "@/components/ui";
import { db } from "@/server/db";
import { getActiveProfileId } from "@/server/session";

export default async function DocumentsPage() {
  const profileId = await getActiveProfileId();
  if (!profileId) return <NoProfile />;
  const docs = await db.generatedDocument.findMany({ where: { profileId }, include: { job: { select: { id: true, title: true, company: true } } }, orderBy: { createdAt: "desc" } });
  const groups = new Map<string, typeof docs>();
  for (const d of docs) {
    const key = d.job ? `${d.job.title} — ${d.job.company}` : "General";
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  return (
    <div className="space-y-6">
      <PageHeader title="Documents" subtitle="Every version is kept with its Truth Gate report and the evidence behind each claim. Generate new ones from a job's page." />
      {docs.length === 0 && <Empty>No documents yet. Open a job and choose “Generate resume”.</Empty>}
      {[...groups.entries()].map(([title, list]) => (
        <Card key={title} title={title} actions={list[0].job ? <Link href={`/jobs/${list[0].job.id}`} className="btn btn-sm">Job →</Link> : null}>
          <table className="table">
            <thead><tr><th>Document</th><th>Version</th><th>Truth Gate</th><th>Engine</th><th>Created</th></tr></thead>
            <tbody>
              {list.map((d) => (
                <tr key={d.id}>
                  <td><Link href={`/documents/${d.id}`}>{d.kind === "RESUME" ? "Resume" : d.kind === "COVER_LETTER" ? "Cover letter" : "Interview prep"}</Link></td>
                  <td>v{d.version}</td>
                  <td><GateBadge status={d.status} /></td>
                  <td className="text-xs text-muted">{d.provider}</td>
                  <td className="text-xs">{fmtDate(d.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}
    </div>
  );
}
