import Link from "next/link";
import { NoProfile } from "@/components/no-profile";
import { Badge, Card, Empty, Notice, PageHeader, TierBadge } from "@/components/ui";
import { applyReadiness } from "@/lib/jobs/freshness";
import { applyRecommendation } from "@/lib/matching/recommend";
import { formatSalary } from "@/lib/jobs/normalize";
import { networkEnabled } from "@/lib/sources";
import { db } from "@/server/db";
import { getActiveProfileId } from "@/server/session";
import { loadWorkspace } from "@/server/views";
import { importManualJob, importUrlAction, rejectJobAction, saveJobAction, unrejectJobAction } from "../actions";

const TIER_RANK: Record<string, number> = { STRONG: 3, GOOD: 2, STRETCH: 1, SKIP: 0 };

type SP = { tier?: string; q?: string; remote?: string; fresh?: string; show?: string; sort?: string; notice?: string; error?: string };

export default async function JobsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const profileId = await getActiveProfileId();
  if (!profileId) return <NoProfile />;
  const sp = await searchParams;
  const { scored, now } = await loadWorkspace(profileId);
  const apps = await db.application.findMany({ where: { profileId }, select: { jobId: true, status: true } });
  const appByJob = new Map(apps.map((a) => [a.jobId, a.status]));

  let rows = scored;
  if (sp.show !== "rejected") rows = rows.filter((r) => r.verdict !== "REJECTED");
  else rows = rows.filter((r) => r.verdict === "REJECTED");
  if (sp.show !== "closed") rows = rows.filter((r) => r.job.status !== "CLOSED");
  if (sp.tier) rows = rows.filter((r) => r.match.tier === sp.tier);
  else if (!sp.show) rows = rows.filter((r) => r.match.tier !== "SKIP");
  if (sp.remote) rows = rows.filter((r) => r.job.remoteType === sp.remote);
  if (sp.fresh) rows = rows.filter((r) => r.match.freshness.ageDays <= Number(sp.fresh));
  if (sp.q) {
    const q = sp.q.toLowerCase();
    rows = rows.filter((r) => `${r.job.title} ${r.job.company} ${r.job.location}`.toLowerCase().includes(q));
  }
  rows = [...rows].sort((a, b) =>
    sp.sort === "fresh" ? a.match.freshness.ageDays - b.match.freshness.ageDays : TIER_RANK[b.match.tier] - TIER_RANK[a.match.tier] || b.match.score - a.match.score,
  );
  const skipCount = scored.filter((r) => r.match.tier === "SKIP" && r.verdict !== "REJECTED").length;

  return (
    <div className="space-y-6">
      <PageHeader title="Jobs" subtitle="Ranked by fit. Hard requirements override everything; transferable experience never counts as verified." />
      {sp.notice && <Notice tone="green">{sp.notice}</Notice>}
      {sp.error && <Notice tone="red">{sp.error}</Notice>}

      <form className="card flex flex-wrap items-end gap-3 p-3">
        <div className="field w-56"><label>Search</label><input name="q" defaultValue={sp.q} placeholder="title, company, city" /></div>
        <div className="field w-36">
          <label>Tier</label>
          <select name="tier" defaultValue={sp.tier ?? ""}><option value="">Not SKIP</option><option>STRONG</option><option>GOOD</option><option>STRETCH</option><option>SKIP</option></select>
        </div>
        <div className="field w-36">
          <label>Remote</label>
          <select name="remote" defaultValue={sp.remote ?? ""}><option value="">Any</option><option>REMOTE</option><option>HYBRID</option><option>ONSITE</option><option>UNKNOWN</option></select>
        </div>
        <div className="field w-36">
          <label>Freshness</label>
          <select name="fresh" defaultValue={sp.fresh ?? ""}><option value="">Any age</option><option value="3">≤ 3 days</option><option value="7">≤ 7 days</option><option value="14">≤ 14 days</option><option value="30">≤ 30 days</option></select>
        </div>
        <div className="field w-36">
          <label>Show</label>
          <select name="show" defaultValue={sp.show ?? ""}><option value="">Active</option><option value="rejected">Rejected by me</option><option value="closed">Include closed</option></select>
        </div>
        <div className="field w-36">
          <label>Sort</label>
          <select name="sort" defaultValue={sp.sort ?? ""}><option value="">Best match</option><option value="fresh">Newest</option></select>
        </div>
        <button className="btn btn-primary">Apply</button>
        <Link href="/jobs" className="btn btn-ghost">Reset</Link>
      </form>
      {!sp.tier && !sp.show && skipCount > 0 && (
        <p className="muted">
          {skipCount} SKIP job{skipCount === 1 ? " is" : "s are"} hidden (hard requirement overrides or low fit). <Link href="/jobs?tier=SKIP">Show them and why →</Link>
        </p>
      )}

      {rows.length ? (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Match</th>
                <th>Gaps</th>
                <th>Pay · location</th>
                <th>Freshness</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ job, match, verdict }) => {
                const ready = applyReadiness(job, match.tier, now);
                const inTracker = appByJob.get(job.id);
                const rec = applyRecommendation(match, { interested: (match.components.find((c) => c.key === "preferences")?.score ?? 0) >= 85 });
                return (
                  <tr key={job.id}>
                    <td className="min-w-56">
                      <Link href={`/jobs/${job.id}`} className="font-medium">{job.title}</Link>
                      <div className="text-xs text-muted">{job.company}{job.status === "CLOSED" ? " · Closed" : ""}</div>
                      {match.blockers[0] && <div className="mt-1 text-xs text-red-700">⛔ {match.blockers[0].message}</div>}
                    </td>
                    <td>
                      <TierBadge tier={match.tier} />
                      <div className="mt-1"><Badge tone={rec.tone} title={rec.rationale}>{rec.label}</Badge></div>
                      {ready.label === "APPLY_NOW" && <div className="mt-1"><Badge tone="green">Apply now</Badge></div>}
                    </td>
                    <td className="text-xs">
                      <div>{match.counts.requiredVerified}/{match.counts.required} required verified</div>
                      <div className={match.counts.hardGaps ? "text-red-700" : "text-muted"}>{match.counts.hardGaps} hard gap{match.counts.hardGaps === 1 ? "" : "s"}</div>
                      {match.counts.transferable > 0 && <div className="text-teal-700">{match.counts.transferable} transferable</div>}
                    </td>
                    <td className="text-xs">
                      <div>{formatSalary(job.salaryMin, job.salaryMax, job.salaryPeriod)}</div>
                      <div className="text-muted">{job.location ?? "—"} · {job.remoteType.toLowerCase()}</div>
                    </td>
                    <td className="text-xs">{match.freshness.label}</td>
                    <td className="text-right">
                      <div className="flex justify-end gap-1">
                        {inTracker ? (
                          <Badge tone="blue">{inTracker.toLowerCase()}</Badge>
                        ) : (
                          <form action={saveJobAction}><input type="hidden" name="jobId" value={job.id} /><button className="btn btn-sm">Save</button></form>
                        )}
                        {verdict === "REJECTED" ? (
                          <form action={unrejectJobAction}><input type="hidden" name="jobId" value={job.id} /><button className="btn btn-sm">Restore</button></form>
                        ) : (
                          <form action={rejectJobAction}><input type="hidden" name="jobId" value={job.id} /><input type="hidden" name="reason" value="Bad fit" /><button className="btn btn-ghost btn-sm" title="Reject as a bad fit">Skip</button></form>
                        )}
                        <Link href={`/jobs/${job.id}`} className="btn btn-sm">Evaluate</Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>No jobs match these filters.</Empty>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Add a job manually" subtitle="Paste a posting. Parsed fields are labelled LIKELY until verified against the employer.">
          <form action={importManualJob} className="grid gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="field"><label>Title</label><input name="title" required /></div>
              <div className="field"><label>Company</label><input name="company" required /></div>
              <div className="field"><label>Location</label><input name="location" placeholder="Austin, TX" /></div>
              <div className="field"><label>Remote</label><select name="remoteType" defaultValue=""><option value="">Unknown</option><option>REMOTE</option><option>HYBRID</option><option>ONSITE</option></select></div>
              <div className="field"><label>Salary min</label><input name="salaryMin" placeholder="45000 or 22" /></div>
              <div className="field"><label>Salary max</label><input name="salaryMax" /></div>
              <div className="field"><label>Pay period</label><select name="salaryPeriod" defaultValue=""><option value="">Auto</option><option value="YEAR">Per year</option><option value="HOUR">Per hour</option></select></div>
              <div className="field"><label>Employment type</label><select name="employmentType" defaultValue=""><option value="">Unknown</option><option value="full-time">Full-time</option><option value="part-time">Part-time</option><option value="contract">Contract</option><option value="internship">Internship</option></select></div>
              <div className="field"><label>Posting URL</label><input name="url" type="url" /></div>
              <div className="field"><label>Posted date (if shown)</label><input name="postedAt" type="date" /></div>
            </div>
            <div className="field"><label>Description (paste the full posting)</label><textarea name="description" rows={8} required /></div>
            <div><button className="btn btn-primary">Import &amp; score</button></div>
          </form>
        </Card>
        <Card title="Import from a URL" subtitle="Greenhouse, Lever and Ashby links use their public APIs; other employer pages are read via schema.org JobPosting data.">
          <form action={importUrlAction} className="grid gap-3">
            <div className="field"><label>Job or board URL</label><input name="url" type="url" placeholder="https://boards.greenhouse.io/acme/jobs/123" required /></div>
            <div><button className="btn">Fetch &amp; import</button></div>
          </form>
          {!networkEnabled() && (
            <p className="mt-3 text-xs text-amber-800">
              Outbound fetching is off (JOB_SOURCES_NETWORK=off in .env), so URL import will explain that instead of fetching. Nothing leaves your machine until you turn it on.
            </p>
          )}
          <p className="mt-3 text-xs text-muted">LinkedIn and Indeed are deliberately not scraped. See docs/JOB_SOURCES.md.</p>
        </Card>
      </div>
    </div>
  );
}
