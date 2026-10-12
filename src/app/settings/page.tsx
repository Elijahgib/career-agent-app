import { ConfirmButton } from "@/components/client";
import { Badge, Card, Notice, PageHeader, fmtDate } from "@/components/ui";
import { resolveProvider } from "@/lib/ai";
import { ADAPTERS, networkEnabled } from "@/lib/sources";
import { db } from "@/server/db";
import { listProfiles } from "@/server/profiles";
import { getActiveProfileId } from "@/server/session";
import { addSourceAction, createProfileAction, deleteProfileAction, importProfileAction, loadDemoAction, removeSourceAction, runScanAction, switchProfile } from "../actions";

const NOTICES: Record<string, string> = {
  "create-profile": "Create a candidate profile to get started.",
  deleted: "Profile and all of its data were deleted.",
  "import-missing": "Choose an export file to import.",
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string; detail?: string }> }) {
  const sp = await searchParams;
  const [profiles, activeId, sources, scans] = await Promise.all([
    listProfiles(),
    getActiveProfileId(),
    db.sourceConfig.findMany({ orderBy: { createdAt: "asc" } }),
    db.scanRun.findMany({ orderBy: { startedAt: "desc" }, take: 5 }),
  ]);
  const { status: ai } = resolveProvider();
  const net = networkEnabled();
  const email = (process.env.EMAIL_CONNECTOR ?? "mock").toLowerCase();

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Candidate profiles, AI provider, job sources, and privacy controls." />
      {sp.notice && <Notice tone={sp.notice === "deleted" ? "green" : "blue"}>{NOTICES[sp.notice] ?? sp.notice}</Notice>}
      {sp.error === "import" ? (
        <Notice tone="red">Could not import that file. {sp.detail ?? "Make sure it is a Career Agent profile export (JSON)."}</Notice>
      ) : sp.error ? (
        <Notice tone="red">Could not save the {sp.error}. Check the form.</Notice>
      ) : null}

      <Card title="Candidate profiles" subtitle="Keep several local profiles (e.g. friends testing the app). Export or delete any profile's data at any time.">
        <table className="table">
          <thead><tr><th>Name</th><th>Level</th><th>Updated</th><th className="text-right">Actions</th></tr></thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.displayName} {p.id === activeId && <Badge tone="green">active</Badge>} {p.isDemo && <Badge>synthetic demo</Badge>}
                </td>
                <td className="text-xs">{p.careerLevel.toLowerCase()}</td>
                <td className="text-xs">{fmtDate(p.updatedAt)}</td>
                <td>
                  <div className="flex justify-end gap-1">
                    {p.id !== activeId && <form action={switchProfile}><input type="hidden" name="profileId" value={p.id} /><button className="btn btn-sm">Switch</button></form>}
                    <a className="btn btn-sm" href={`/api/profiles/${p.id}/export`}>Export JSON</a>
                    <form action={deleteProfileAction}><input type="hidden" name="profileId" value={p.id} /><ConfirmButton message={`Permanently delete ${p.displayName} and ALL of their data (facts, applications, documents)? Export first if you want a copy.`}>Delete</ConfirmButton></form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <form action={createProfileAction} className="grid gap-2 md:grid-cols-2">
            <div className="md:col-span-2 text-sm font-semibold">New candidate</div>
            <div className="field"><label>Name</label><input name="displayName" required /></div>
            <div className="field"><label>Career level</label><select name="careerLevel" defaultValue="EARLY"><option value="ENTRY">Entry</option><option value="EARLY">Early</option><option value="MID">Mid</option><option value="SENIOR">Senior</option></select></div>
            <div className="field"><label>City</label><input name="city" /></div>
            <div className="field"><label>State</label><input name="region" /></div>
            <div><button className="btn btn-primary">Create &amp; switch</button></div>
          </form>
          <div className="space-y-3">
            <form action={importProfileAction} className="space-y-2">
              <div className="text-sm font-semibold">Import a profile export</div>
              <input type="file" name="file" accept="application/json" className="text-sm" />
              <div><button className="btn btn-sm">Import as new profile</button></div>
            </form>
            <div className="flex flex-wrap gap-2">
              <form action={loadDemoAction}><button className="btn btn-sm">Load synthetic demo data</button></form>
              <form action={loadDemoAction}><input type="hidden" name="reset" value="1" /><ConfirmButton className="btn btn-sm" message="Delete and re-create all synthetic demo profiles and demo jobs?">Reset demo data</ConfirmButton></form>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="AI provider" subtitle="Optional. Only used to reword single verified bullets; the Truth Gate checks every output.">
          <div className="space-y-2 text-sm">
            <div>Active: <Badge tone={ai.remote ? "amber" : "green"}>{ai.label}</Badge></div>
            {ai.warning && <Notice tone="amber">{ai.warning}</Notice>}
            <p className="muted">Configure with <span className="kbd">AI_PROVIDER</span> = template | anthropic | openai in <span className="kbd">.env</span>. {ai.remote ? "When used, one fact plus its allowed/prohibited wording is sent to the provider — never your contact details or full profile." : "Nothing leaves this machine."}</p>
          </div>
        </Card>
        <Card title="Email connector" subtitle="Architecture only in v0.1.">
          <div className="space-y-2 text-sm">
            <div>Connector: <Badge tone="green">{email === "mock" ? "Mock inbox (synthetic)" : `${email} (not implemented — falls back to none)`}</Badge></div>
            <p className="muted">Future Gmail/Outlook connectors would use read-only OAuth scopes, store only derived signals (type, company, role, confidence), and always require your confirmation before any status change. Emails are never sent. Try it from the Tracker page.</p>
          </div>
        </Card>
      </div>

      <Card
        title="Job sources & background scan"
        subtitle="Public ATS feeds checked directly from employers — earlier and cleaner than job-board alerts. LinkedIn/Indeed are not scraped."
        actions={<form action={runScanAction}><button className="btn btn-primary btn-sm">Run scan now</button></form>}
      >
        {!net && <Notice tone="amber">Outbound fetching is OFF (<span className="kbd">JOB_SOURCES_NETWORK=off</span>). Scans will record a clear error for each source instead of fetching. Set it to <span className="kbd">on</span> in .env to enable live Greenhouse / Lever / Ashby / career-page checks.</Notice>}
        <table className="table mt-3">
          <thead><tr><th>Source</th><th>Identifier</th><th>Endpoint</th><th>Last scan</th><th></th></tr></thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id}>
                <td><Badge tone="blue">{s.sourceType.toLowerCase()}</Badge></td>
                <td className="text-sm">{s.identifier}{s.label ? <div className="text-xs text-muted">{s.label}</div> : null}</td>
                <td className="max-w-xs truncate text-xs text-muted">{ADAPTERS[s.sourceType as keyof typeof ADAPTERS]?.describe(s.identifier)}</td>
                <td className="text-xs">{s.lastScanAt ? fmtDate(s.lastScanAt) : "never"}<div className={s.lastStatus === "ERROR" ? "text-red-700" : "text-muted"}>{s.lastError ?? s.lastStatus ?? ""}</div></td>
                <td className="text-right"><form action={removeSourceAction}><input type="hidden" name="sourceId" value={s.id} /><button className="btn btn-ghost btn-sm">Remove</button></form></td>
              </tr>
            ))}
            {sources.length === 0 && <tr><td colSpan={5} className="text-center text-sm text-muted">No saved sources yet.</td></tr>}
          </tbody>
        </table>
        <form action={addSourceAction} className="mt-3 flex flex-wrap items-end gap-2">
          <div className="field w-40"><label>Type</label><select name="sourceType" defaultValue="GREENHOUSE"><option value="GREENHOUSE">Greenhouse</option><option value="LEVER">Lever</option><option value="ASHBY">Ashby</option><option value="CAREER_PAGE">Career page URL</option></select></div>
          <div className="field w-72"><label>Board token / company slug / URL</label><input name="identifier" placeholder="e.g. acme or https://jobs.lever.co/acme" required /></div>
          <div className="field w-48"><label>Label (optional)</label><input name="label" /></div>
          <button className="btn">Add source</button>
        </form>
        {scans.length > 0 && (
          <div className="mt-4">
            <div className="text-sm font-semibold">Recent scans</div>
            <ul className="mt-1 space-y-0.5 text-xs text-muted">
              {scans.map((s) => (
                <li key={s.id}>{s.startedAt.toISOString().slice(0, 16).replace("T", " ")} · {s.trigger.toLowerCase()} · {s.status.toLowerCase()} · {s.jobsSeen} seen, {s.jobsNew} new, {s.jobsClosed} closed {JSON.parse(s.errorsJson).length ? `· ${JSON.parse(s.errorsJson)[0]}` : ""}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-3 text-xs text-muted">Schedule <span className="kbd">npm run scan</span> with Windows Task Scheduler or cron for unattended scans.</p>
      </Card>

      <Card title="Privacy">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>All data lives in a local SQLite file (<span className="kbd">prisma/dev.db</span>). No accounts, no cloud, no telemetry (Next.js telemetry is disabled by the launch script).</li>
          <li>Nothing is sent to third parties unless you configure an AI provider or turn on job-source fetching — see docs/PRIVACY.md for exactly what each integration transmits.</li>
          <li>Export any profile as JSON, or delete it (and everything linked to it) from the table above.</li>
          <li>Demo profiles and jobs are synthetic; no real applicant data ships with the app.</li>
        </ul>
      </Card>
    </div>
  );
}
