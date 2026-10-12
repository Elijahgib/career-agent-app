import Link from "next/link";
import { AutoSubmitSelect } from "@/components/client";
import { NoProfile } from "@/components/no-profile";
import { Badge, Card, Empty, Notice, PageHeader, fmtDate } from "@/components/ui";
import { nowMs } from "@/lib/time";
import { db } from "@/server/db";
import { getActiveProfileId } from "@/server/session";
import { STATUSES } from "@/server/tracker";
import { addInterviewAction, changeStatusAction, deleteInterviewAction, resolveSignalAction, scanInboxAction, updateApplicationAction } from "../actions";

const COLUMNS: { title: string; statuses: string[] }[] = [
  { title: "Saved / ready", statuses: ["DISCOVERED", "EVALUATED", "SAVED", "READY"] },
  { title: "Applied", statuses: ["APPLIED"] },
  { title: "Screen / interview", statuses: ["SCREEN", "INTERVIEW"] },
  { title: "Offer", statuses: ["OFFER"] },
  { title: "Closed", statuses: ["REJECTED", "EMPLOYER_CLOSED", "SKIP"] },
];

export default async function TrackerPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const profileId = await getActiveProfileId();
  if (!profileId) return <NoProfile />;
  const sp = await searchParams;
  const [apps, signals, docs] = await Promise.all([
    db.application.findMany({ where: { profileId }, include: { events: { orderBy: { createdAt: "desc" } }, interviews: { orderBy: { scheduledAt: "asc" } } }, orderBy: { updatedAt: "desc" } }),
    db.emailSignal.findMany({ where: { profileId }, orderBy: { receivedAt: "desc" }, take: 20 }),
    db.generatedDocument.findMany({ where: { profileId }, select: { id: true, kind: true, version: true, jobId: true, status: true } }),
  ]);
  const appById = new Map(apps.map((a) => [a.id, a]));
  const now = nowMs();

  return (
    <div className="space-y-6">
      <PageHeader title="Application tracker" subtitle="Every status change is logged. You submit applications yourself; the tracker records what happened." />
      {sp.notice && <Notice>{sp.notice}</Notice>}

      <div className="grid gap-4 xl:grid-cols-5 lg:grid-cols-3 md:grid-cols-2">
        {COLUMNS.map((col) => {
          const items = apps.filter((a) => col.statuses.includes(a.status));
          return (
            <div key={col.title} className="rounded-xl border border-line bg-slate-50/60 p-2">
              <div className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-muted">
                {col.title} <span>{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.length ? (
                  items.map((a) => (
                    <div key={a.id} id={a.id} className="scroll-mt-20 rounded-lg border border-line bg-white p-2.5 text-sm shadow-sm">
                      <div className="font-medium leading-tight">{a.jobId ? <Link href={`/jobs/${a.jobId}`}>{a.role}</Link> : a.role}</div>
                      <div className="text-xs text-muted">{a.company}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge tone={a.status === "OFFER" ? "green" : a.status === "INTERVIEW" || a.status === "SCREEN" ? "purple" : a.status === "APPLIED" ? "blue" : ["REJECTED", "EMPLOYER_CLOSED", "SKIP"].includes(a.status) ? "gray" : "amber"}>{a.status.toLowerCase().replace("_", " ")}</Badge>
                        {a.followUpAt && ["APPLIED", "SCREEN", "INTERVIEW"].includes(a.status) && <Badge tone={a.followUpAt.getTime() <= now + 86_400_000 ? "amber" : "gray"}>follow up {fmtDate(a.followUpAt)}</Badge>}
                      </div>
                      <form action={changeStatusAction} className="mt-2">
                        <input type="hidden" name="applicationId" value={a.id} />
                        <AutoSubmitSelect name="status" defaultValue={a.status} className="!py-1 !text-xs" options={STATUSES.map((s) => ({ value: s, label: s.toLowerCase().replace("_", " ") }))} />
                      </form>
                      <details className="mt-2 text-xs">
                        <summary className="text-brand">Details</summary>
                        <div className="mt-2 space-y-2">
                          <div className="text-muted">
                            {a.salaryText ?? "Salary n/a"} · {a.location ?? "—"} · {a.source ?? "—"}
                            {a.reqId ? ` · Req ${a.reqId}` : ""}
                          </div>
                          {a.url && <a href={a.url} target="_blank" rel="noopener noreferrer">Posting ↗</a>}
                          <div className="flex flex-wrap gap-2">
                            {a.resumeDocumentId && <Link href={`/documents/${a.resumeDocumentId}`}>Resume used</Link>}
                            {a.coverLetterDocumentId && <Link href={`/documents/${a.coverLetterDocumentId}`}>Cover letter used</Link>}
                            {!a.resumeDocumentId && docs.filter((d) => d.jobId === a.jobId).length > 0 && <span className="text-muted">{docs.filter((d) => d.jobId === a.jobId).length} doc version(s)</span>}
                          </div>
                          <form action={updateApplicationAction} className="space-y-1">
                            <input type="hidden" name="applicationId" value={a.id} />
                            <label className="block text-xs">Applied on <input type="date" name="appliedAt" defaultValue={a.appliedAt?.toISOString().slice(0, 10) ?? ""} /></label>
                            <label className="block text-xs">Follow up on <input type="date" name="followUpAt" defaultValue={a.followUpAt?.toISOString().slice(0, 10) ?? ""} /></label>
                            <label className="block text-xs">Notes <textarea name="notes" rows={2} defaultValue={a.notes ?? ""} /></label>
                            <label className="block text-xs">Outcome <input name="outcome" defaultValue={a.outcome ?? ""} /></label>
                            <button className="btn btn-sm">Save</button>
                          </form>
                          <div>
                            <div className="font-semibold">Interviews</div>
                            {a.interviews.map((iv) => (
                              <div key={iv.id} className="flex items-start justify-between gap-1">
                                <span>{iv.scheduledAt.toISOString().slice(0, 16).replace("T", " ")} · {iv.kind.toLowerCase().replace("_", " ")}{iv.withWhom ? ` · ${iv.withWhom}` : ""}</span>
                                <form action={deleteInterviewAction}><input type="hidden" name="interviewId" value={iv.id} /><button className="text-red-700">×</button></form>
                              </div>
                            ))}
                            <form action={addInterviewAction} className="mt-1 space-y-1">
                              <input type="hidden" name="applicationId" value={a.id} />
                              <input type="datetime-local" name="scheduledAt" required />
                              <select name="kind" defaultValue="PHONE_SCREEN"><option value="PHONE_SCREEN">Phone screen</option><option value="VIDEO">Video</option><option value="TECHNICAL">Technical</option><option value="ONSITE">On-site</option><option value="OTHER">Other</option></select>
                              <input name="withWhom" placeholder="With whom" />
                              <button className="btn btn-sm">Add interview</button>
                            </form>
                            {a.jobId && <Link href={`/interview/${a.jobId}`}>Interview prep →</Link>}
                          </div>
                          <div>
                            <div className="font-semibold">History</div>
                            <ul className="space-y-0.5">
                              {a.events.map((e) => (
                                <li key={e.id} className="text-muted">
                                  {fmtDate(e.createdAt)} · {e.fromStatus ? `${e.fromStatus.toLowerCase()} → ` : ""}
                                  {e.toStatus.toLowerCase()} {e.actor !== "USER" ? `(${e.actor.toLowerCase().replace("_", " ")})` : ""} {e.note ? `— ${e.note}` : ""}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </details>
                    </div>
                  ))
                ) : (
                  <div className="px-1 py-4 text-center text-xs text-muted">—</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Card
        title={<span id="email">Email-detected status changes</span>}
        subtitle="Architecture preview: a mock inbox stands in for Gmail/Outlook. Only derived signals are stored, and nothing changes until you confirm."
        actions={<form action={scanInboxAction}><button className="btn btn-sm">Scan mock inbox</button></form>}
      >
        {signals.length ? (
          <table className="table">
            <thead><tr><th>Received</th><th>Detected</th><th>Company / subject</th><th>Suggestion</th><th></th></tr></thead>
            <tbody>
              {signals.map((s) => (
                <tr key={s.id}>
                  <td className="text-xs">{fmtDate(s.receivedAt)}</td>
                  <td><Badge tone={s.detectedType === "OFFER" ? "green" : s.detectedType === "REJECTION" ? "red" : s.detectedType === "INTERVIEW" ? "purple" : "blue"}>{s.detectedType.toLowerCase()}</Badge> <span className="text-xs text-muted">{Math.round(s.confidence * 100)}%</span></td>
                  <td className="text-xs">{s.company ?? "Unknown"}<div className="text-muted">{s.subject}</div></td>
                  <td className="text-xs">{s.applicationId && s.suggestedStatus ? `${appById.get(s.applicationId)?.role ?? "Application"} → ${s.suggestedStatus.toLowerCase()}` : "No matching application"}</td>
                  <td className="text-right">
                    {s.state === "PENDING" ? (
                      <div className="flex justify-end gap-1">
                        {s.applicationId && s.suggestedStatus && <form action={resolveSignalAction}><input type="hidden" name="signalId" value={s.id} /><input type="hidden" name="accept" value="1" /><button className="btn btn-primary btn-sm">Confirm</button></form>}
                        <form action={resolveSignalAction}><input type="hidden" name="signalId" value={s.id} /><input type="hidden" name="accept" value="0" /><button className="btn btn-sm">Dismiss</button></form>
                      </div>
                    ) : (
                      <span className="text-xs text-muted">{s.state.toLowerCase()}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>No email signals. Use “Scan mock inbox” to see how confirmations, interview requests and rejections would be suggested.</Empty>
        )}
      </Card>
    </div>
  );
}
