import Link from "next/link";
import { ConfirmButton } from "@/components/client";
import { NoProfile } from "@/components/no-profile";
import { Badge, Card, PageHeader, VerifBadge } from "@/components/ui";
import { formatYm } from "@/lib/evidence/ledger";
import { db } from "@/server/db";
import { toPreferences } from "@/server/mappers";
import { getActiveProfileId } from "@/server/session";
import { addEducation, addPosition, deleteEducation, deletePosition, toggleEducationVerified, togglePositionVerified, updatePreferences, updateProfileBasics } from "../actions";

const EMPLOYMENT = ["FULL_TIME", "PART_TIME", "CONTRACT", "TEMP", "INTERNSHIP"];

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const profileId = await getActiveProfileId();
  if (!profileId) return <NoProfile />;
  const sp = await searchParams;
  const p = await db.candidateProfile.findUnique({
    where: { id: profileId },
    include: { preferences: true, positions: { orderBy: [{ endDate: "desc" }, { startDate: "desc" }] }, education: true, facts: { where: { category: { in: ["SKILL", "TOOL", "SOFT_SKILL", "CERTIFICATION", "LICENSE"] } } } },
  });
  if (!p) return <NoProfile />;
  const prefs = toPreferences(p.preferences);
  const links = JSON.parse(p.links) as string[];

  return (
    <div className="space-y-6">
      <PageHeader title="Profile" subtitle="Your canonical candidate profile. Generated documents never rewrite these facts — they only select, order and emphasise them." actions={<Link href="/evidence" className="btn">Open Evidence Ledger →</Link>} />
      {sp.error && <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">Please check the {sp.error} form (dates use YYYY-MM).</p>}

      <Card title="Basics" subtitle="Contact details only appear in the header of your own documents.">
        <form action={updateProfileBasics} className="grid gap-3 md:grid-cols-3">
          <div className="field"><label>Name</label><input name="displayName" defaultValue={p.displayName} required /></div>
          <div className="field"><label>Private headline (never printed)</label><input name="headline" defaultValue={p.headline ?? ""} /></div>
          <div className="field">
            <label>Career level</label>
            <select name="careerLevel" defaultValue={p.careerLevel}>
              <option value="ENTRY">Entry</option>
              <option value="EARLY">Early career</option>
              <option value="MID">Mid</option>
              <option value="SENIOR">Senior</option>
            </select>
          </div>
          <div className="field"><label>Email</label><input name="email" type="email" defaultValue={p.email ?? ""} /></div>
          <div className="field"><label>Phone</label><input name="phone" defaultValue={p.phone ?? ""} /></div>
          <div className="field"><label>Links (comma separated)</label><input name="links" defaultValue={links.join(", ")} /></div>
          <div className="field"><label>City</label><input name="city" defaultValue={p.city ?? ""} /></div>
          <div className="field"><label>State / region</label><input name="region" defaultValue={p.region ?? ""} /></div>
          <div className="field"><label>Country</label><input name="country" defaultValue={p.country ?? "US"} /></div>
          <div className="md:col-span-3"><button className="btn btn-primary">Save basics</button></div>
        </form>
      </Card>

      <Card title="Work history" subtitle="Unverified positions are hidden from documents. Each verified position creates a ROLE fact that licenses its exact job title.">
        <div className="space-y-2">
          {p.positions.map((pos) => (
            <div key={pos.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
              <div>
                <div className="font-medium">
                  {pos.title} — {pos.employer}
                </div>
                <div className="muted">
                  {pos.location ?? "—"} · {pos.employmentType.replace("_", "-").toLowerCase()} · {formatYm(pos.startDate)} – {formatYm(pos.endDate)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <VerifBadge status={pos.verificationStatus} />
                <form action={togglePositionVerified}>
                  <input type="hidden" name="positionId" value={pos.id} />
                  <button className="btn btn-sm">{pos.verificationStatus === "VERIFIED" ? "Mark unverified" : "Verify"}</button>
                </form>
                <form action={deletePosition}>
                  <input type="hidden" name="positionId" value={pos.id} />
                  <ConfirmButton message="Delete this position? Its facts stay in the ledger but lose their employer link.">Delete</ConfirmButton>
                </form>
              </div>
            </div>
          ))}
        </div>
        <details className="mt-4">
          <summary className="text-sm font-medium text-brand">+ Add a position</summary>
          <form action={addPosition} className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="field"><label>Job title (exactly as held)</label><input name="title" required /></div>
            <div className="field"><label>Employer</label><input name="employer" required /></div>
            <div className="field"><label>Location</label><input name="location" placeholder="City, ST" /></div>
            <div className="field"><label>Start (YYYY-MM)</label><input name="startDate" placeholder="2022-03" required /></div>
            <div className="field"><label>End (YYYY-MM, blank = current)</label><input name="endDate" placeholder="" /></div>
            <div className="field">
              <label>Type</label>
              <select name="employmentType" defaultValue="FULL_TIME">
                {[...EMPLOYMENT, "VOLUNTEER"].map((e) => <option key={e} value={e}>{e.replace("_", "-").toLowerCase()}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 md:col-span-2"><input type="checkbox" name="verified" /> I can back this up (title, employer and dates are accurate)</label>
            <div><button className="btn btn-primary">Add position</button></div>
          </form>
        </details>
      </Card>

      <Card title="Education">
        <div className="space-y-2">
          {p.education.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
              <div>
                <div className="font-medium">{e.credential}</div>
                <div className="muted">{e.institution} · {e.level.replace("_", " ").toLowerCase()} · {e.status.replace("_", " ").toLowerCase()} {e.endDate ? `· ${e.endDate}` : ""}</div>
              </div>
              <div className="flex items-center gap-2">
                <VerifBadge status={e.verificationStatus} />
                <form action={toggleEducationVerified}><input type="hidden" name="educationId" value={e.id} /><button className="btn btn-sm">{e.verificationStatus === "VERIFIED" ? "Mark unverified" : "Verify"}</button></form>
                <form action={deleteEducation}><input type="hidden" name="educationId" value={e.id} /><ConfirmButton message="Delete this education entry?">Delete</ConfirmButton></form>
              </div>
            </div>
          ))}
        </div>
        <details className="mt-4">
          <summary className="text-sm font-medium text-brand">+ Add education</summary>
          <form action={addEducation} className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="field"><label>Credential</label><input name="credential" placeholder="A.A.S. Network Administration" required /></div>
            <div className="field"><label>Institution</label><input name="institution" required /></div>
            <div className="field">
              <label>Level</label>
              <select name="level" defaultValue="ASSOCIATE">
                {["HIGH_SCHOOL", "CERTIFICATE", "ASSOCIATE", "BACHELOR", "MASTER", "DOCTORATE"].map((l) => <option key={l} value={l}>{l.replace("_", " ").toLowerCase()}</option>)}
              </select>
            </div>
            <div className="field"><label>Field</label><input name="field" /></div>
            <div className="field">
              <label>Status</label>
              <select name="status" defaultValue="COMPLETED"><option value="COMPLETED">Completed</option><option value="IN_PROGRESS">In progress</option><option value="INCOMPLETE">Incomplete</option></select>
            </div>
            <div className="field"><label>End (YYYY-MM)</label><input name="endDate" /></div>
            <label className="flex items-center gap-2 md:col-span-2"><input type="checkbox" name="verified" /> Verified (I hold this credential)</label>
            <div><button className="btn btn-primary">Add education</button></div>
          </form>
        </details>
      </Card>

      <Card title="Skills, tools & credentials" subtitle="Skills live in the Evidence Ledger so every one carries a source and a verification status." actions={<Link href="/evidence#add" className="btn btn-sm">Add skill evidence</Link>}>
        <div className="flex flex-wrap gap-2">
          {p.facts.length ? p.facts.map((f) => <Badge key={f.id} tone={f.verificationStatus === "VERIFIED" ? "green" : "amber"} title={f.canonicalFact}>{f.code} · {f.canonicalFact.slice(0, 48)}</Badge>) : <span className="muted">No skill/tool facts yet.</span>}
        </div>
      </Card>

      <Card title="Search preferences" subtitle="Hard limits here can override an otherwise high match score.">
        <form action={updatePreferences} className="grid gap-3 md:grid-cols-3">
          <div className="field md:col-span-2"><label>Target titles (comma separated)</label><input name="targetTitles" defaultValue={prefs.targetTitles.join(", ")} /></div>
          <div className="field"><label>Keywords you want to see</label><input name="targetKeywords" defaultValue={prefs.targetKeywords.join(", ")} /></div>
          <div className="field"><label>Target salary (annual)</label><input name="desiredSalaryMin" defaultValue={prefs.desiredSalaryMin ?? ""} placeholder="50000" /></div>
          <div className="field"><label>Hard salary floor (annual)</label><input name="salaryHardFloor" defaultValue={prefs.salaryHardFloor ?? ""} placeholder="40000" /></div>
          <div className="field">
            <label>Remote preference</label>
            <select name="remotePreference" defaultValue={prefs.remotePreference}>
              <option value="ANY">Any</option>
              <option value="REMOTE_OR_HYBRID">Remote or hybrid</option>
              <option value="REMOTE_ONLY">Remote only (hard limit)</option>
              <option value="ONSITE_PREFERRED">On-site preferred</option>
            </select>
          </div>
          <div className="field md:col-span-2"><label>Acceptable locations (one per line; include “Remote” if remote is OK)</label><textarea name="acceptableLocations" rows={3} defaultValue={prefs.acceptableLocations.join("\n")} /></div>
          <div className="space-y-2 pt-6">
            <label className="flex items-center gap-2"><input type="checkbox" name="willingToRelocate" defaultChecked={prefs.willingToRelocate} /> Willing to relocate</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="hasDriversLicense" defaultChecked={prefs.hasDriversLicense} /> Valid driver&apos;s license</label>
          </div>
          <fieldset className="field">
            <label>Employment types wanted</label>
            <div className="flex flex-wrap gap-3 text-sm">{EMPLOYMENT.map((e) => <label key={e} className="flex items-center gap-1 font-normal"><input type="checkbox" name="employmentTypes" value={e} defaultChecked={prefs.employmentTypes.includes(e as never)} />{e.replace("_", "-").toLowerCase()}</label>)}</div>
          </fieldset>
          <fieldset className="field">
            <label>Excluded employment types (hard limit)</label>
            <div className="flex flex-wrap gap-3 text-sm">{EMPLOYMENT.map((e) => <label key={e} className="flex items-center gap-1 font-normal"><input type="checkbox" name="excludedEmploymentTypes" value={e} defaultChecked={prefs.excludedEmploymentTypes.includes(e as never)} />{e.replace("_", "-").toLowerCase()}</label>)}</div>
          </fieldset>
          <div className="field">
            <label>Security clearance held</label>
            <select name="securityClearance" defaultValue={prefs.securityClearance}><option value="NONE">None</option><option value="PUBLIC_TRUST">Public trust</option><option value="SECRET">Secret</option><option value="TOP_SECRET">Top secret</option></select>
          </div>
          <div className="field"><label>Excluded companies</label><input name="excludedCompanies" defaultValue={prefs.excludedCompanies.join(", ")} /></div>
          <div className="field"><label>Excluded keywords</label><input name="excludedKeywords" defaultValue={prefs.excludedKeywords.join(", ")} placeholder="commission only" /></div>
          <div className="field"><label>Max travel %</label><input name="canTravelPercent" defaultValue={prefs.canTravelPercent ?? ""} /></div>
          <div className="field md:col-span-2"><label>Work authorization note (private)</label><input name="workAuthorization" defaultValue={prefs.workAuthorization ?? ""} /></div>
          <div className="md:col-span-3"><button className="btn btn-primary">Save preferences</button></div>
        </form>
      </Card>
    </div>
  );
}
