import Link from "next/link";
import { redirect } from "next/navigation";
import { ConfirmButton } from "@/components/client";
import { ResumeDropzone } from "@/components/resume-dropzone";
import { Badge, Card, Notice, PageHeader } from "@/components/ui";
import { db } from "@/server/db";
import { getActiveProfileId } from "@/server/session";
import {
  addEducation, addFact, addPosition, confirmResumeAndContinue, confirmResumeSection, deleteEducation, deleteFact, deletePosition,
  editEducation, editPosition, setFactVerification, toggleEducationVerified, togglePositionVerified,
  updateFact, updateProfileBasics,
} from "../../actions";

function ConfirmSection({ section, label }: { section: string; label: string }) {
  return (
    <form action={confirmResumeSection}>
      <input type="hidden" name="section" value={section} />
      <button className="btn btn-primary btn-sm">{label}</button>
    </form>
  );
}

export const dynamic = "force-dynamic";

const EMP_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "TEMP", "INTERNSHIP"];
const EDU_LEVELS = ["HIGH_SCHOOL", "CERTIFICATE", "ASSOCIATE", "BACHELOR", "MASTER", "DOCTORATE"];

function StatusPill({ status }: { status: string }) {
  return status === "VERIFIED" ? <Badge tone="green">Verified</Badge> : <Badge tone="amber">Unverified</Badge>;
}
function CheckThis() {
  return <Badge tone="red" title="Low parsing confidence — double-check this">Check this</Badge>;
}
const isPlaceholder = (v?: string | null) => !!v && v.includes("(unknown");

export default async function ResumeReviewPage({ searchParams }: { searchParams: Promise<{ imported?: string }> }) {
  const sp = await searchParams;
  const profileId = await getActiveProfileId();
  if (!profileId) redirect("/onboarding");
  const [profile, positions, education, facts] = await Promise.all([
    db.candidateProfile.findUnique({ where: { id: profileId } }),
    db.position.findMany({ where: { profileId }, orderBy: { startDate: "desc" } }),
    db.education.findMany({ where: { profileId }, orderBy: { endDate: "desc" } }),
    db.evidenceFact.findMany({ where: { profileId }, orderBy: { code: "asc" } }),
  ]);
  if (!profile) redirect("/onboarding");
  const bulletsOf = (pid: string) => facts.filter((f) => f.positionId === pid);
  const skills = facts.filter((f) => f.category === "SKILL" && !f.positionId);
  const certs = facts.filter((f) => f.category === "CERTIFICATION");
  const looseDuties = facts.filter((f) => (f.category === "DUTY" || f.category === "ACHIEVEMENT") && !f.positionId);
  const links = (() => { try { return (JSON.parse(profile.links || "[]") as string[]); } catch { return []; } })();
  const dutyCount = facts.filter((f) => f.category === "DUTY" || f.category === "ACHIEVEMENT").length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Review your resume" subtitle="We filled this in from your resume. Check and fix anything, then verify what you can back up. Nothing here is used in a document until you verify it." />

      {sp.imported && (
        <Notice tone="blue">
          <strong>Resume parsed.</strong> {positions.length} work experience{positions.length === 1 ? "" : "s"}, {education.length} education entr{education.length === 1 ? "y" : "ies"}, {dutyCount} duty bullet{dutyCount === 1 ? "" : "s"}, {skills.length} skill{skills.length === 1 ? "" : "s"}, and {certs.length} certification{certs.length === 1 ? "" : "s"} found. Review the information below before verifying it — anything marked <Badge tone="red">Check this</Badge> had low confidence.
        </Notice>
      )}

      {/* ── Resume manager: re-upload / replace ── */}
      <Card title="Resume" subtitle="Uploaded a newer resume? Upload it here and we'll show exactly what changed — new roles, updated dates — without duplicating anything you already have.">
        <ResumeDropzone returnTo="evidence" withPaste />
      </Card>

      {/* ── Personal information ── */}
      <Card title="Personal information">
        <form action={updateProfileBasics} className="grid gap-3 md:grid-cols-2">
          <div className="field md:col-span-2"><label>Name {isPlaceholder(profile.displayName) || profile.displayName === "Unnamed candidate" ? <CheckThis /> : null}</label><input name="displayName" defaultValue={profile.displayName} /></div>
          <div className="field"><label>Email</label><input name="email" type="email" defaultValue={profile.email ?? ""} /></div>
          <div className="field"><label>Phone</label><input name="phone" defaultValue={profile.phone ?? ""} /></div>
          <div className="field"><label>City</label><input name="city" defaultValue={profile.city ?? ""} /></div>
          <div className="field"><label>State</label><input name="region" defaultValue={profile.region ?? ""} /></div>
          <div className="field md:col-span-2"><label>LinkedIn / links (comma separated)</label><input name="links" defaultValue={links.join(", ")} /></div>
          <input type="hidden" name="careerLevel" value={profile.careerLevel} />
          <div className="md:col-span-2"><button className="btn btn-sm">Save personal info</button></div>
        </form>
      </Card>

      {/* ── Work history ── */}
      <Card title={`Work history (${positions.length})`} subtitle="Read each role, fix anything wrong, then confirm." actions={<ConfirmSection section="work" label="Confirm work history" />}>
        <div className="space-y-4">
          {positions.length === 0 && <p className="muted text-sm">No work history yet. Add a role below.</p>}
          {positions.map((p) => (
            <div key={p.id} className="rounded-lg border border-line p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold">{p.title} · {p.employer} {(isPlaceholder(p.employer) || isPlaceholder(p.title)) && <CheckThis />} <StatusPill status={p.verificationStatus} /></div>
                <div className="flex gap-1">
                  <form action={togglePositionVerified}><input type="hidden" name="positionId" value={p.id} /><button className={`btn btn-sm ${p.verificationStatus === "VERIFIED" ? "" : "btn-primary"}`}>{p.verificationStatus === "VERIFIED" ? "Unverify" : "Verify"}</button></form>
                  <form action={deletePosition}><input type="hidden" name="positionId" value={p.id} /><ConfirmButton message={`Delete ${p.title} · ${p.employer}?`}>Delete</ConfirmButton></form>
                </div>
              </div>
              <form action={editPosition} className="grid gap-2 md:grid-cols-2">
                <input type="hidden" name="positionId" value={p.id} />
                <div className="field"><label>Employer</label><input name="employer" defaultValue={p.employer} /></div>
                <div className="field"><label>Job title</label><input name="title" defaultValue={p.title} /></div>
                <div className="field"><label>Start (YYYY-MM)</label><input name="startDate" defaultValue={p.startDate} /></div>
                <div className="field"><label>End (YYYY-MM, blank = present)</label><input name="endDate" defaultValue={p.endDate ?? ""} /></div>
                <div className="field"><label>Location</label><input name="location" defaultValue={p.location ?? ""} /></div>
                <div className="field"><label>Type</label><select name="employmentType" defaultValue={p.employmentType}>{EMP_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ").toLowerCase()}</option>)}</select></div>
                <div className="md:col-span-2"><button className="btn btn-sm">Save role</button></div>
              </form>
              <div className="mt-3">
                <div className="mb-1 text-xs font-semibold text-slate-600">Duty bullets</div>
                <ul className="space-y-1">
                  {bulletsOf(p.id).map((b) => (
                    <li key={b.id} className="flex flex-wrap items-center gap-1">
                      <form action={updateFact} className="flex flex-1 items-center gap-1">
                        <input type="hidden" name="factId" value={b.id} />
                        <input name="canonicalFact" defaultValue={b.canonicalFact} className="!py-1 flex-1 !text-sm" />
                        <button className="btn btn-sm">Save</button>
                      </form>
                      {b.confidence === "LOW" && b.verificationStatus !== "VERIFIED" && <CheckThis />}
                      <StatusPill status={b.verificationStatus} />
                      <form action={setFactVerification}><input type="hidden" name="factId" value={b.id} /><input type="hidden" name="status" value={b.verificationStatus === "VERIFIED" ? "UNVERIFIED" : "VERIFIED"} /><button className="btn btn-sm">{b.verificationStatus === "VERIFIED" ? "Unverify" : "Verify"}</button></form>
                      <form action={deleteFact}><input type="hidden" name="factId" value={b.id} /><button className="btn btn-ghost btn-sm">✕</button></form>
                    </li>
                  ))}
                </ul>
                <form action={addFact} className="mt-1 flex items-center gap-1">
                  <input type="hidden" name="positionId" value={p.id} />
                  <input type="hidden" name="category" value="DUTY" />
                  <input type="hidden" name="experienceType" value="PROFESSIONAL" />
                  <input name="canonicalFact" placeholder="Add a duty bullet" className="!py-1 flex-1 !text-sm" />
                  <button className="btn btn-sm">+ Add bullet</button>
                </form>
              </div>
            </div>
          ))}
          {looseDuties.length > 0 && (
            <details className="rounded-lg border border-dashed border-line p-3 text-sm">
              <summary className="cursor-pointer text-amber-800">We found {looseDuties.length} line{looseDuties.length === 1 ? "" : "s"} of resume text we couldn&apos;t confidently place under a role — review unmatched information</summary>
              <ul className="mt-2 space-y-1">
                {looseDuties.map((b) => (
                  <li key={b.id} className="flex items-center gap-1">
                    <form action={updateFact} className="flex flex-1 items-center gap-1"><input type="hidden" name="factId" value={b.id} /><input name="canonicalFact" defaultValue={b.canonicalFact} className="!py-1 flex-1 !text-sm" /><button className="btn btn-sm">Save</button></form>
                    <form action={deleteFact}><input type="hidden" name="factId" value={b.id} /><button className="btn btn-ghost btn-sm">✕</button></form>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <details>
            <summary className="cursor-pointer text-sm text-brand">+ Add a role</summary>
            <form action={addPosition} className="mt-2 grid gap-2 md:grid-cols-2">
              <div className="field"><label>Employer</label><input name="employer" required /></div>
              <div className="field"><label>Title</label><input name="title" required /></div>
              <div className="field"><label>Start (YYYY-MM)</label><input name="startDate" placeholder="2023-06" required /></div>
              <div className="field"><label>End (YYYY-MM)</label><input name="endDate" placeholder="blank = present" /></div>
              <div className="field"><label>Location</label><input name="location" /></div>
              <div className="field"><label>Type</label><select name="employmentType" defaultValue="FULL_TIME">{EMP_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ").toLowerCase()}</option>)}</select></div>
              <div className="md:col-span-2"><button className="btn btn-sm">Add role</button></div>
            </form>
          </details>
        </div>
      </Card>

      {/* ── Education ── */}
      <Card title={`Education (${education.length})`} actions={education.length ? <ConfirmSection section="education" label="Confirm education" /> : undefined}>
        <div className="space-y-3">
          {education.map((e) => (
            <div key={e.id} className="rounded-lg border border-line p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{e.credential} {isPlaceholder(e.institution) && <CheckThis />} <StatusPill status={e.verificationStatus} /></span>
                <div className="flex gap-1">
                  <form action={toggleEducationVerified}><input type="hidden" name="educationId" value={e.id} /><button className={`btn btn-sm ${e.verificationStatus === "VERIFIED" ? "" : "btn-primary"}`}>{e.verificationStatus === "VERIFIED" ? "Unverify" : "Verify"}</button></form>
                  <form action={deleteEducation}><input type="hidden" name="educationId" value={e.id} /><ConfirmButton message={`Delete ${e.credential}?`}>Delete</ConfirmButton></form>
                </div>
              </div>
              <form action={editEducation} className="grid gap-2 md:grid-cols-2">
                <input type="hidden" name="educationId" value={e.id} />
                <div className="field"><label>School</label><input name="institution" defaultValue={e.institution} /></div>
                <div className="field"><label>Credential</label><input name="credential" defaultValue={e.credential} /></div>
                <div className="field"><label>Field</label><input name="field" defaultValue={e.field ?? ""} /></div>
                <div className="field"><label>Level</label><select name="level" defaultValue={e.level}>{EDU_LEVELS.map((l) => <option key={l} value={l}>{l.replace("_", " ").toLowerCase()}</option>)}</select></div>
                <div className="field"><label>Year (YYYY-MM)</label><input name="endDate" defaultValue={e.endDate ?? ""} /></div>
                <div className="field"><label>GPA</label><input name="gpa" defaultValue={e.gpa ?? ""} /></div>
                <div className="field md:col-span-2"><label>Honors</label><input name="honors" defaultValue={e.honors ?? ""} /></div>
                <div className="md:col-span-2"><button className="btn btn-sm">Save education</button></div>
              </form>
            </div>
          ))}
          <details>
            <summary className="cursor-pointer text-sm text-brand">+ Add education</summary>
            <form action={addEducation} className="mt-2 grid gap-2 md:grid-cols-2">
              <div className="field"><label>Institution</label><input name="institution" required /></div>
              <div className="field"><label>Credential</label><input name="credential" required /></div>
              <div className="field"><label>Level</label><select name="level" defaultValue="CERTIFICATE">{EDU_LEVELS.map((l) => <option key={l} value={l}>{l.replace("_", " ").toLowerCase()}</option>)}</select></div>
              <div className="field"><label>Year</label><input name="endDate" placeholder="2023-05" /></div>
              <div className="md:col-span-2"><button className="btn btn-sm">Add education</button></div>
            </form>
          </details>
        </div>
      </Card>

      {/* ── Skills ── */}
      <Card title={`Skills (${skills.length})`} subtitle="Remove any you wouldn't claim, then confirm." actions={skills.length ? <ConfirmSection section="skills" label="Confirm skills" /> : undefined}>
        <div className="space-y-1">
          {skills.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-1">
              <form action={updateFact} className="flex flex-1 items-center gap-1"><input type="hidden" name="factId" value={s.id} /><input name="canonicalFact" defaultValue={s.canonicalFact} className="!py-1 flex-1 !text-sm" /><button className="btn btn-sm">Save</button></form>
              {s.confidence === "LOW" && s.verificationStatus !== "VERIFIED" && <CheckThis />}
              <StatusPill status={s.verificationStatus} />
              <form action={setFactVerification}><input type="hidden" name="factId" value={s.id} /><input type="hidden" name="status" value={s.verificationStatus === "VERIFIED" ? "UNVERIFIED" : "VERIFIED"} /><button className="btn btn-sm">{s.verificationStatus === "VERIFIED" ? "Unverify" : "Verify"}</button></form>
              <form action={deleteFact}><input type="hidden" name="factId" value={s.id} /><button className="btn btn-ghost btn-sm">✕</button></form>
            </div>
          ))}
          <form action={addFact} className="mt-1 flex items-center gap-1"><input type="hidden" name="category" value="SKILL" /><input type="hidden" name="experienceType" value="PROFESSIONAL" /><input name="canonicalFact" placeholder="Add a skill" className="!py-1 flex-1 !text-sm" /><button className="btn btn-sm">+ Add skill</button></form>
        </div>
      </Card>

      {/* ── Certifications ── */}
      <Card title={`Certifications (${certs.length})`} actions={certs.length ? <ConfirmSection section="certs" label="Confirm certifications" /> : undefined}>
        <div className="space-y-1">
          {certs.length === 0 && <p className="muted text-sm">None found. Add any you hold.</p>}
          {certs.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-1">
              <form action={updateFact} className="flex flex-1 items-center gap-1"><input type="hidden" name="factId" value={c.id} /><input name="canonicalFact" defaultValue={c.canonicalFact} className="!py-1 flex-1 !text-sm" /><button className="btn btn-sm">Save</button></form>
              <StatusPill status={c.verificationStatus} />
              <form action={setFactVerification}><input type="hidden" name="factId" value={c.id} /><input type="hidden" name="status" value={c.verificationStatus === "VERIFIED" ? "UNVERIFIED" : "VERIFIED"} /><button className="btn btn-sm">{c.verificationStatus === "VERIFIED" ? "Unverify" : "Verify"}</button></form>
              <form action={deleteFact}><input type="hidden" name="factId" value={c.id} /><button className="btn btn-ghost btn-sm">✕</button></form>
            </div>
          ))}
          <form action={addFact} className="mt-1 flex items-center gap-1"><input type="hidden" name="category" value="CERTIFICATION" /><input type="hidden" name="experienceType" value="PROFESSIONAL" /><input name="canonicalFact" placeholder="Add a certification" className="!py-1 flex-1 !text-sm" /><button className="btn btn-sm">+ Add certification</button></form>
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2 pb-8">
        <Link href="/evidence" className="btn btn-ghost btn-sm">Advanced verification (Evidence Ledger)</Link>
        <div className="flex flex-wrap gap-2">
          <Link href="/onboarding?step=preferences" className="btn btn-sm">Continue without confirming</Link>
          <form action={confirmResumeAndContinue}><button className="btn btn-primary">I&apos;ve reviewed this — continue →</button></form>
        </div>
      </div>
    </div>
  );
}
