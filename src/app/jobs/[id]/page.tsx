import Link from "next/link";
import { notFound } from "next/navigation";
import { NoProfile } from "@/components/no-profile";
import { Badge, Card, GateBadge, Notice, PageHeader, ReqStatusBadge, ScoreBar, TierBadge, VerifBadge, fmtDate } from "@/components/ui";
import { applyReadiness, fieldStatuses, sourceLeadNote } from "@/lib/jobs/freshness";
import { formatSalary } from "@/lib/jobs/normalize";
import { matchJob } from "@/lib/matching/engine";
import { applyRecommendation, tierLabel } from "@/lib/matching/recommend";
import { resolveProvider } from "@/lib/ai";
import { db } from "@/server/db";
import { analysisFor, getJob } from "@/server/jobs";
import { getSnapshot } from "@/server/profiles";
import { getActiveProfileId } from "@/server/session";
import { generateDocAction, markVerifiedAction, rejectJobAction, saveJobAction, unrejectJobAction, verifyJobAction } from "../../actions";

export default async function JobDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> }) {
  const profileId = await getActiveProfileId();
  if (!profileId) return <NoProfile />;
  const { id } = await params;
  const sp = await searchParams;
  const [job, snapshot] = await Promise.all([getJob(id), getSnapshot(profileId)]);
  if (!job) notFound();
  if (!snapshot) return <NoProfile />;
  const analysis = analysisFor(job);
  const match = matchJob(snapshot, job, { analysis });
  const [app, docs, verdict] = await Promise.all([
    db.application.findUnique({ where: { profileId_jobId: { profileId, jobId: id } } }),
    db.generatedDocument.findMany({ where: { profileId, jobId: id }, orderBy: { createdAt: "desc" }, select: { id: true, kind: true, version: true, status: true, createdAt: true } }),
    db.jobMatch.findUnique({ where: { profileId_jobId: { profileId, jobId: id } }, select: { userVerdict: true, verdictReason: true } }),
  ]);
  const ready = applyReadiness(job, match.tier);
  const fields = fieldStatuses(job, analysis);
  const lead = sourceLeadNote(job);
  const { status: ai } = resolveProvider();
  const interested = (match.components.find((c) => c.key === "preferences")?.score ?? 0) >= 85;
  const rec = applyRecommendation(match, { interested });
  // Keep the numeric-score reason line out of the primary UI; scores stay internal.
  const displayReasons = match.reasons.filter((r) => !/^Score \d+\/100/.test(r));
  const byStatus = (s: string[]) => match.requirements.filter((r) => s.includes(r.status));
  const factText = (code: string) => snapshot.facts.find((f) => f.code === code)?.canonicalFact ?? "";

  return (
    <div className="space-y-6">
      <PageHeader
        title={job.title}
        subtitle={
          <>
            {job.company} · {job.location ?? "Location n/a"} · {job.remoteType.toLowerCase()} · {formatSalary(job.salaryMin, job.salaryMax, job.salaryPeriod)}
            {job.reqId ? ` · Req ${job.reqId}` : ""}
          </>
        }
        actions={
          <>
            {app ? (
              <Link href={`/tracker#${app.id}`} className="btn">In tracker: {app.status.toLowerCase()}</Link>
            ) : (
              <form action={saveJobAction}><input type="hidden" name="jobId" value={job.id} /><button className="btn">Move to tracker</button></form>
            )}
            {verdict?.userVerdict === "REJECTED" ? (
              <form action={unrejectJobAction}><input type="hidden" name="jobId" value={job.id} /><button className="btn">Restore</button></form>
            ) : (
              <form action={rejectJobAction} className="flex gap-1">
                <input type="hidden" name="jobId" value={job.id} />
                <select name="reason" className="!w-40 !py-1" defaultValue="Bad fit">
                  <option>Bad fit</option><option>Not interested in company</option><option>Pay too low</option><option>Location</option><option>Already applied elsewhere</option>
                </select>
                <button className="btn btn-danger">Reject</button>
              </form>
            )}
            <Link href={`/interview/${job.id}`} className="btn">Interview prep</Link>
          </>
        }
      />
      {sp.notice && <Notice tone={sp.notice.toLowerCase().includes("disabled") || sp.notice.includes("no structured") ? "amber" : "green"}>{sp.notice === "merged" ? "This posting matched an existing job; the new source was added to its provenance instead of creating a duplicate." : sp.notice}</Notice>}
      {verdict?.userVerdict === "REJECTED" && <Notice tone="amber">You rejected this job ({verdict.verdictReason}). It is excluded from skill-gap analysis and notifications.</Notice>}

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card title={<span className="flex items-center gap-2">Fit: <TierBadge tier={match.tier} /></span>} subtitle={match.summary.replace(/^(STRONG|GOOD|STRETCH) MATCH/, tierLabel(match.tier)).replace(/^SKIP\b/, "Skip")}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">Should I apply?</span> <Badge tone={rec.tone}>{rec.label}</Badge>
          </div>
          <p className="mb-4 text-sm text-slate-700">{rec.rationale}</p>
          <ul className="mb-3 list-disc space-y-1 pl-5 text-sm">
            {displayReasons.map((r, i) => <li key={i} className={r.startsWith("Hard requirement") ? "font-medium text-red-700" : ""}>{r}</li>)}
          </ul>
          <details className="text-xs text-muted">
            <summary className="cursor-pointer">Advanced scoring (internal — used for ranking only)</summary>
            <div className="mt-2 space-y-3">
              {match.components.map((c) => (
                <div key={c.key}>
                  <div className="flex justify-between"><span className="font-medium text-slate-600">{c.label} <span className="text-muted">(weight {c.weight})</span></span><span>{c.score}</span></div>
                  <ScoreBar score={c.score} tone={c.score >= 75 ? "green" : c.score >= 45 ? "blue" : c.score >= 20 ? "amber" : "red"} />
                  <div className="mt-0.5">{c.explanation}</div>
                </div>
              ))}
            </div>
          </details>
        </Card>

        <div className="space-y-6">
          <Card title="Apply readiness" subtitle="APPLY NOW only appears for recently verified, fresh, strong or good fits.">
            <div className="mb-2">{ready.label === "APPLY_NOW" ? <Badge tone="green">APPLY NOW</Badge> : <Badge tone={ready.label === "CLOSED" ? "red" : "amber"}>{ready.label.replace("_", " ")}</Badge>}</div>
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-slate-600">{ready.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <form action={verifyJobAction}><input type="hidden" name="jobId" value={job.id} /><button className="btn btn-sm">Re-check source</button></form>
              <form action={markVerifiedAction}><input type="hidden" name="jobId" value={job.id} /><button className="btn btn-sm" title="Record that you opened the posting and it is still open">I checked it today</button></form>
              {job.applyUrl && <a className="btn btn-sm" href={job.applyUrl} target="_blank" rel="noopener noreferrer">Open posting ↗</a>}
            </div>
            <p className="mt-2 text-xs text-muted">You submit applications yourself — the app never auto-applies.</p>
          </Card>
          <Card title="Job facts" subtitle="VERIFIED = confirmed by a structured source; LIKELY = parsed from text; UNKNOWN = not stated.">
            <table className="table">
              <tbody>
                {fields.map((f) => (
                  <tr key={f.field}><td className="text-xs text-muted">{f.label}</td><td className="text-xs">{f.value}</td><td className="text-right"><VerifBadge status={f.status} /></td></tr>
                ))}
              </tbody>
            </table>
            {analysis.uninterpretedRequirements.length > 0 && (
              <div className="mt-3 text-xs">
                <div className="font-semibold">Requirements the analyzer could not interpret (shown as UNKNOWN, not guessed):</div>
                <ul className="list-disc pl-5">{analysis.uninterpretedRequirements.map((u) => <li key={u}>{u}</li>)}</ul>
              </div>
            )}
          </Card>
        </div>
      </div>

      <Card title="Requirements vs. your evidence" subtitle="Verified matches, transferable experience and hard gaps are kept separate. Transferable experience is relevant but can never be claimed as the requirement itself.">
        <div className="grid gap-4 lg:grid-cols-3">
          <div>
            <h3 className="mb-2 text-emerald-800">Verified match ({byStatus(["VERIFIED"]).length})</h3>
            <ul className="space-y-2 text-sm">
              {byStatus(["VERIFIED"]).map((r) => (
                <li key={r.conceptId}>
                  <div className="flex items-center gap-1"><span className="font-medium">{r.label}</span> <span className="text-xs text-muted">{r.importance.toLowerCase()}</span></div>
                  <details className="text-xs"><summary className="text-brand">Why can I say this?</summary><ul className="mt-1 space-y-0.5 pl-2">{r.factCodes.slice(0, 4).map((c) => <li key={c}><span className="kbd">{c}</span> {factText(c)}</li>)}</ul></details>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-teal-800">Partial / transferable / learning / unverified / exposure ({byStatus(["PARTIAL", "TRANSFERABLE", "LEARNING_ONLY", "NOT_VERIFIED", "EXPOSURE_ONLY"]).length})</h3>
            <ul className="space-y-2 text-sm">
              {byStatus(["PARTIAL", "TRANSFERABLE", "LEARNING_ONLY", "NOT_VERIFIED", "EXPOSURE_ONLY"]).map((r) => (
                <li key={r.conceptId}>
                  <div className="flex flex-wrap items-center gap-1"><span className="font-medium">{r.label}</span> <ReqStatusBadge status={r.status} /> <span className="text-xs text-muted">{r.importance.toLowerCase()}</span></div>
                  {r.transfer && r.status === "TRANSFERABLE" && <div className="text-xs text-teal-800">From {r.transfer.fromLabel} ({r.transfer.factCodes.slice(0, 2).join(", ")}): {r.transfer.note}</div>}
                  {r.status === "LEARNING_ONLY" && <div className="text-xs text-violet-800">Study/lab only: {r.factCodes.join(", ")} — describe as learning, not experience.</div>}
                  {r.status === "PARTIAL" && <div className="text-xs text-blue-800">Partial ({r.factCodes.join(", ")}): your evidence shows hands-on use, not the level the posting names. Describe exactly what you did.</div>}
                  {r.status === "EXPOSURE_ONLY" && <div className="text-xs text-amber-800">Exposure only ({r.factCodes.join(", ")}): your evidence shows you escalated, observed, assisted with or worked alongside this — not that you did it.</div>}
                  {r.status === "NOT_VERIFIED" && <div className="text-xs text-amber-800">Matches unverified {r.factCodes.join(", ")}. <Link href={`/evidence?filter=unverified#${r.factCodes[0]}`}>Verify it</Link> to count.</div>}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-red-800">Gaps ({byStatus(["HARD_GAP", "GAP"]).length})</h3>
            <ul className="space-y-2 text-sm">
              {byStatus(["HARD_GAP", "GAP"]).map((r) => (
                <li key={r.conceptId}>
                  <div className="flex flex-wrap items-center gap-1"><span className="font-medium">{r.label}</span> <ReqStatusBadge status={r.status} /> <span className="text-xs text-muted">{r.importance.toLowerCase()}</span></div>
                  <div className="text-xs text-muted">“{r.evidenceText.slice(0, 110)}”</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Tailored documents" subtitle="Generated only from VERIFIED facts. Any unsupported phrase blocks the document.">
          <div className="flex flex-wrap gap-2">
            <form action={generateDocAction} className="flex items-center gap-2">
              <input type="hidden" name="jobId" value={job.id} />
              <input type="hidden" name="kind" value="RESUME" />
              <button className="btn btn-primary">Generate resume</button>
              {ai.active !== "template" && <label className="flex items-center gap-1 text-xs font-normal"><input type="checkbox" name="useAi" /> reword with {ai.label}</label>}
            </form>
            <form action={generateDocAction}>
              <input type="hidden" name="jobId" value={job.id} />
              <input type="hidden" name="kind" value="COVER_LETTER" />
              <button className="btn">Generate cover letter</button>
            </form>
          </div>
          {docs.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2">
                  <Link href={`/documents/${d.id}`}>{d.kind === "RESUME" ? "Resume" : "Cover letter"} v{d.version}</Link>
                  <span className="flex items-center gap-2 text-xs text-muted">{fmtDate(d.createdAt)} <GateBadge status={d.status} /></span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Source provenance" subtitle="Where this posting was seen. Duplicates from multiple sources are merged here.">
          <ul className="space-y-1 text-sm">
            {(job.sources ?? []).map((s, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <Badge tone="blue">{s.sourceType.toLowerCase()}</Badge> <span>{s.sourceName}</span>
                <span className="text-xs text-muted">first seen {fmtDate(s.firstSeenAt)} · last seen {fmtDate(s.lastSeenAt)}</span>
                {s.url && <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-xs">link ↗</a>}
              </li>
            ))}
          </ul>
          {lead && <p className="mt-2 text-sm text-emerald-800">{lead}</p>}
          <p className="mt-2 text-xs text-muted">Posted {fmtDate(job.postedAt)} · first seen {fmtDate(job.firstSeenAt)} · last verified {fmtDate(job.lastVerifiedAt)} · status {job.status.toLowerCase()}</p>
        </Card>
      </div>

      <Card title="Posting">
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-800">{job.description}</pre>
      </Card>
    </div>
  );
}
