import Link from "next/link";
import { ConfirmButton } from "@/components/client";
import { ResumeDropzone } from "@/components/resume-dropzone";
import { Badge, Card, Notice, PageHeader, VerifBadge } from "@/components/ui";
import { categoryLabel } from "@/lib/labels";
import { db } from "@/server/db";
import { getProfileRow } from "@/server/profiles";
import { getActiveProfileId } from "@/server/session";
import { addEducation, addFact, addPosition, deleteFact, loadDemoAction, setFactVerification, startOnboardingProfile, updatePreferences, updateProfileBasics } from "../actions";

export const dynamic = "force-dynamic";

const EMP_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "TEMP", "INTERNSHIP"];
const EDU_LEVELS = ["HIGH_SCHOOL", "CERTIFICATE", "ASSOCIATE", "BACHELOR", "MASTER", "DOCTORATE"];
const EXP_TYPES = ["PROFESSIONAL", "VOLUNTEER", "ACADEMIC", "PROJECT", "LEARNING"];

type Step = "work" | "education" | "skills" | "preferences" | "review";
const ORDER: Step[] = ["work", "education", "skills", "preferences", "review"];
const STEP_NO: Record<Step, number> = { work: 2, education: 3, skills: 4, preferences: 5, review: 6 };
const LABELS = ["Identity", "Work History", "Education", "Skills", "Preferences", "Truth Review"];

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {LABELS.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        return (
          <li key={label} className="flex items-center gap-2">
            <span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] font-semibold ${n === current ? "bg-brand text-white" : done ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"}`}>{done ? "✓" : n}</span>
            <span className={n === current ? "font-semibold" : "text-muted"}>{label}</span>
            {i < LABELS.length - 1 && <span className="text-slate-300">→</span>}
          </li>
        );
      })}
    </ol>
  );
}

function StepNav({ step }: { step: Step }) {
  const i = ORDER.indexOf(step);
  const prev = i <= 0 ? null : ORDER[i - 1];
  const next = i >= ORDER.length - 1 ? null : ORDER[i + 1];
  return (
    <div className="flex items-center justify-between pt-2">
      <Link href={prev ? `/onboarding?step=${prev}` : "/profile"} className="btn btn-sm">← Back</Link>
      {next ? (
        <Link href={`/onboarding?step=${next}`} className="btn btn-primary btn-sm">Next: {LABELS[STEP_NO[next] - 1]} →</Link>
      ) : (
        <Link href="/dashboard" className="btn btn-primary btn-sm">Finish → Dashboard</Link>
      )}
    </div>
  );
}

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ step?: string; error?: string; detail?: string; notice?: string }> }) {
  const sp = await searchParams;
  const activeId = await getActiveProfileId();
  const active = activeId ? await getProfileRow(activeId) : null;
  const real = active && !active.isDemo ? active : null;

  // ── First run: choose demo vs. create (identity step) ──
  if (!real) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader title="Welcome to Career Agent" subtitle="A truthful, local-first job-search assistant. Let's get you set up — about five minutes." />
        {sp.error === "name" && <Notice tone="red">Please enter a name to create your profile.</Notice>}
        <Stepper current={1} />
        <div className="grid gap-5 md:grid-cols-2">
          <Card title="Try the demo first" subtitle="Explore with synthetic candidates and sample jobs — nothing real, nothing saved about you.">
            <div className="space-y-3 text-sm">
              <p>See how matching, the Truth Gate, resumes and the tracker work before entering your own details.</p>
              <form action={loadDemoAction}><button className="btn btn-primary">Load the demo</button></form>
            </div>
          </Card>
          <Card title="Create my profile" subtitle="Step 1 of 6 — Identity. Only a name is required; everything else is optional and editable later.">
            <form action={startOnboardingProfile} className="grid gap-3">
              <div className="field"><label htmlFor="o-name">Preferred / display name *</label><input id="o-name" name="displayName" required placeholder="Jordan Rivera" /></div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="field"><label htmlFor="o-city">City</label><input id="o-city" name="city" placeholder="St. Louis" /></div>
                <div className="field"><label htmlFor="o-region">State</label><input id="o-region" name="region" placeholder="MO" /></div>
                <div className="field"><label htmlFor="o-email">Email</label><input id="o-email" name="email" type="email" placeholder="you@example.com" /></div>
                <div className="field"><label htmlFor="o-phone">Phone</label><input id="o-phone" name="phone" placeholder="(optional)" /></div>
              </div>
              <div className="field"><label htmlFor="o-linkedin">LinkedIn URL</label><input id="o-linkedin" name="linkedin" placeholder="https://linkedin.com/in/… (optional)" /></div>
              <div className="field"><label htmlFor="o-level">Career level</label><select id="o-level" name="careerLevel" defaultValue="EARLY"><option value="ENTRY">Entry</option><option value="EARLY">Early</option><option value="MID">Mid</option><option value="SENIOR">Senior</option></select></div>
              <div><button className="btn btn-primary">Create profile &amp; continue →</button></div>
            </form>
          </Card>
        </div>
        <Notice tone="blue"><strong>How Career Agent stays honest:</strong> it keeps a ledger of what you&apos;ve actually done and will <em>never</em> turn an unverified or weaker experience into a stronger resume claim. You verify your facts; the Truth Gate blocks anything a document can&apos;t back up.</Notice>
      </div>
    );
  }

  // ── Guided steps for the real profile ──
  const step: Step = (ORDER as string[]).includes(sp.step ?? "") ? (sp.step as Step) : "work";
  const [positions, education, facts, prefs] = await Promise.all([
    db.position.findMany({ where: { profileId: real.id }, orderBy: { startDate: "desc" } }),
    db.education.findMany({ where: { profileId: real.id } }),
    db.evidenceFact.findMany({ where: { profileId: real.id }, orderBy: [{ verificationStatus: "asc" }, { code: "asc" }] }),
    db.preferences.findUnique({ where: { profileId: real.id } }),
  ]);
  const verifiedCount = facts.filter((f) => f.verificationStatus === "VERIFIED").length;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title={`Set up ${real.displayName.split(" ")[0]}'s profile`} subtitle="Each step saves as you go — stop and come back any time." actions={<Link href="/dashboard" className="btn btn-sm">Skip to Dashboard</Link>} />
      <Stepper current={STEP_NO[step]} />
      {sp.notice && <Notice tone="green">{sp.notice}</Notice>}
      {sp.error === "resume" && <Notice tone="red">Couldn&apos;t import that resume. {sp.detail ?? "Try a different file or paste the text."}</Notice>}
      {sp.error === "position" && <Notice tone="red">Check the role — employer, title, and a start month (YYYY-MM) are required.</Notice>}
      {sp.error === "education" && <Notice tone="red">Education needs at least an institution and a credential.</Notice>}

      {step === "work" && (
        <Card title="Step 2 · Work History" subtitle="Upload your resume to prefill everything, or add roles by hand.">
          <div className="space-y-4">
            <ResumeDropzone returnTo="onboarding" withPaste />
            {positions.length > 0 && <ul className="list-disc pl-5 text-sm">{positions.map((p) => <li key={p.id}>{p.title} · {p.employer} <span className="text-muted">({p.startDate}–{p.endDate ?? "present"})</span> {p.verificationStatus !== "VERIFIED" && <Badge tone="amber">Unverified</Badge>}</li>)}</ul>}
            <form action={addPosition} className="grid gap-2 md:grid-cols-2">
              <div className="md:col-span-2 text-sm font-semibold">Add a role manually</div>
              <div className="field"><label>Employer</label><input name="employer" required /></div>
              <div className="field"><label>Title</label><input name="title" required /></div>
              <div className="field"><label>Location</label><input name="location" placeholder="City, ST or Remote" /></div>
              <div className="field"><label>Employment type</label><select name="employmentType" defaultValue="FULL_TIME">{EMP_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ").toLowerCase()}</option>)}</select></div>
              <div className="field"><label>Start (YYYY-MM)</label><input name="startDate" placeholder="2023-06" required /></div>
              <div className="field"><label>End (YYYY-MM, blank = current)</label><input name="endDate" placeholder="2024-12" /></div>
              <div className="md:col-span-2"><button className="btn btn-sm">Add role</button></div>
            </form>
            <StepNav step="work" />
          </div>
        </Card>
      )}

      {step === "education" && (
        <Card title="Step 3 · Education" subtitle="Degrees, certificates, or training. Skip if not relevant.">
          <div className="space-y-4">
            {education.length > 0 && <ul className="list-disc pl-5 text-sm">{education.map((e) => <li key={e.id}>{e.credential} · {e.institution}</li>)}</ul>}
            <form action={addEducation} className="grid gap-2 md:grid-cols-2">
              <div className="field"><label>Institution</label><input name="institution" required /></div>
              <div className="field"><label>Credential</label><input name="credential" placeholder="A.A.S. Network Administration" required /></div>
              <div className="field"><label>Level</label><select name="level" defaultValue="CERTIFICATE">{EDU_LEVELS.map((l) => <option key={l} value={l}>{l.replace("_", " ").toLowerCase()}</option>)}</select></div>
              <div className="field"><label>Field</label><input name="field" /></div>
              <div className="field"><label>End (YYYY-MM)</label><input name="endDate" placeholder="2022-05" /></div>
              <div className="md:col-span-2"><button className="btn btn-sm">Add education</button></div>
            </form>
            <StepNav step="education" />
          </div>
        </Card>
      )}

      {step === "skills" && (
        <Card title="Step 4 · Skills & Experience" subtitle="Keep the honesty tiers separate — the app never promotes a weaker one into a stronger claim.">
          <div className="space-y-4">
            <ul className="space-y-1 text-sm">
              <li><Badge tone="blue">Professional</Badge> paid/volunteer work you did hands-on.</li>
              <li><Badge tone="teal">Project</Badge> real projects or home-lab work you performed.</li>
              <li><Badge tone="purple">Lab / Study</Badge> coursework — learning, not professional experience.</li>
            </ul>
            <ResumeDropzone returnTo="onboarding" />
            <form action={addFact} className="grid gap-2 md:grid-cols-2">
              <div className="md:col-span-2 text-sm font-semibold">Add a skill or thing you did</div>
              <div className="field md:col-span-2"><label>What you did / know (plain words)</label><input name="canonicalFact" placeholder="Supported Windows laptops and printers" required /></div>
              <div className="field"><label>Category</label><select name="category" defaultValue="SKILL"><option value="SKILL">skill</option><option value="DUTY">duty</option><option value="TOOL">tool</option><option value="CERTIFICATION">certification</option><option value="PROJECT">project</option></select></div>
              <div className="field"><label>Experience type</label><select name="experienceType" defaultValue="PROFESSIONAL">{EXP_TYPES.map((t) => <option key={t} value={t}>{t.toLowerCase()}</option>)}</select></div>
              <div className="md:col-span-2"><button className="btn btn-sm">Add (unverified)</button></div>
            </form>
            <p className="muted text-xs">For allowed/prohibited wording and relationship nuances, the full <Link href="/evidence">Evidence Ledger</Link> has every control.</p>
            <StepNav step="skills" />
          </div>
        </Card>
      )}

      {step === "preferences" && (
        <Card title="Step 5 · Job Preferences" subtitle="Tell us both what you can do and what you want to do — both shape your matches.">
          <div className="space-y-4">
            <form action={updatePreferences} className="grid gap-3 md:grid-cols-2">
              <div className="field md:col-span-2">
                <label>What kind of work do you want to do?</label>
                <input name="targetTitles" list="role-ideas" defaultValue={prefs ? (JSON.parse(prefs.targetTitlesJson || "[]") as string[]).join(", ") : ""} placeholder="e.g. IT Support, Help Desk, Desktop Support, Data Center Technician" />
                <datalist id="role-ideas">
                  {["IT Support", "Help Desk", "Desktop Support", "Field Service Technician", "Network Support", "Data Center Technician", "Data Analyst", "Systems Administrator", "Software Support"].map((r) => <option key={r} value={r} />)}
                </datalist>
                <p className="muted mt-1 text-xs">These are the roles you <em>want</em> — they shape your matches and your &ldquo;should I apply?&rdquo; guidance. You don&apos;t have to be fully qualified yet.</p>
              </div>
              <div className="field md:col-span-2"><label>Anything you&apos;d like to move into later? (optional)</label><input name="targetKeywords" defaultValue={prefs ? (JSON.parse(prefs.targetKeywordsJson || "[]") as string[]).join(", ") : ""} placeholder="e.g. cloud, networking, security" /></div>
              <div className="field"><label>Remote preference</label><select name="remotePreference" defaultValue={prefs?.remotePreference ?? "ANY"}><option value="ANY">Any</option><option value="REMOTE_ONLY">Remote only</option><option value="REMOTE_OR_HYBRID">Remote or hybrid</option><option value="ONSITE_PREFERRED">On-site</option></select></div>
              <div className="field"><label>Acceptable locations</label><input name="acceptableLocations" defaultValue={prefs ? (JSON.parse(prefs.acceptableLocationsJson || "[]") as string[]).join(", ") : ""} placeholder="St. Louis, MO" /></div>
              <div className="field"><label>Salary target (annual)</label><input name="desiredSalaryMin" defaultValue={prefs?.desiredSalaryMin ?? ""} placeholder="55000" /></div>
              <div className="field"><label>Hard salary floor (reject below)</label><input name="salaryHardFloor" defaultValue={prefs?.salaryHardFloor ?? ""} placeholder="45000" /></div>
              <div className="field md:col-span-2"><label>Anything you absolutely don&apos;t want? (optional)</label><input name="excludedKeywords" defaultValue={prefs ? (JSON.parse(prefs.excludedKeywordsJson || "[]") as string[]).join(", ") : ""} placeholder="e.g. commission-only, door-to-door, overnight" /></div>
              <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" name="hasDriversLicense" defaultChecked={prefs?.hasDriversLicense ?? true} /> I have a driver&apos;s license</label>
              <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" name="willingToRelocate" defaultChecked={prefs?.willingToRelocate ?? false} /> Willing to relocate</label>
              <input type="hidden" name="employmentTypes" value="FULL_TIME" />
              <div className="md:col-span-2"><button className="btn btn-primary btn-sm">Save preferences</button></div>
            </form>
            <Notice tone="blue">What you <em>can</em> do and what you <em>want</em> to do both matter. Once you&apos;ve added some verified experience, the <Link href="/skills">Skill plan</Link> suggests realistic career directions and exactly what each would need.</Notice>
            <StepNav step="preferences" />
          </div>
        </Card>
      )}

      {step === "review" && (
        <Card title="Step 6 · Truth Review" subtitle="Mark only what you can back up as Verified. Only verified facts can ever authorize a generated resume or cover-letter claim.">
          <div className="space-y-4">
            {facts.some((f) => (f.source ?? "").toLowerCase().includes("imported resume")) && (
              <Notice tone="amber">We filled these in from your resume. <strong>Review them before verifying</strong> — anything marked <em>Check this</em> had low parsing confidence. Nothing is trusted until you verify it.</Notice>
            )}
            <Notice tone="blue">Everything imported or added starts <strong>Unverified</strong>. Verify what&apos;s accurate, edit wording in the full ledger, or delete what doesn&apos;t belong. Nothing here can bypass the Truth Gate.</Notice>
            <details className="rounded-lg border border-line p-3 text-sm">
              <summary className="cursor-pointer font-semibold">Your details (filled from your resume — edit if needed)</summary>
              <form action={updateProfileBasics} className="mt-3 grid gap-2 md:grid-cols-2">
                <div className="field md:col-span-2"><label>Display name</label><input name="displayName" defaultValue={real.displayName} /></div>
                <div className="field"><label>Email</label><input name="email" type="email" defaultValue={real.email ?? ""} /></div>
                <div className="field"><label>Phone</label><input name="phone" defaultValue={real.phone ?? ""} /></div>
                <div className="field"><label>City</label><input name="city" defaultValue={real.city ?? ""} /></div>
                <div className="field"><label>State</label><input name="region" defaultValue={real.region ?? ""} /></div>
                <div className="field md:col-span-2"><label>Links (LinkedIn, portfolio — one per line)</label><input name="links" defaultValue={(() => { try { return (JSON.parse(real.links || "[]") as string[]).join(", "); } catch { return ""; } })()} /></div>
                <input type="hidden" name="careerLevel" value={real.careerLevel} />
                <div className="md:col-span-2"><button className="btn btn-sm">Save details</button></div>
              </form>
            </details>
            {facts.length === 0 ? (
              <p className="muted text-sm">No facts yet. Go back to add work history and skills, or upload a resume on the Work step.</p>
            ) : (
              <div className="space-y-2">
                <div className="text-sm text-muted">{verifiedCount} of {facts.length} verified</div>
                {facts.map((f) => (
                  <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-white p-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="kbd">{f.code}</span><VerifBadge status={f.verificationStatus} /><Badge>{categoryLabel(f.category)}</Badge>{f.confidence === "LOW" && f.verificationStatus !== "VERIFIED" && <Badge tone="amber" title="Imported with low confidence — double-check it">Check this</Badge>}
                        <span className="text-muted">{f.context ?? f.source}</span>
                      </div>
                      <div className="mt-0.5">{f.canonicalFact}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <form action={setFactVerification}><input type="hidden" name="factId" value={f.id} /><input type="hidden" name="status" value={f.verificationStatus === "VERIFIED" ? "UNVERIFIED" : "VERIFIED"} /><button className={`btn btn-sm ${f.verificationStatus === "VERIFIED" ? "" : "btn-primary"}`}>{f.verificationStatus === "VERIFIED" ? "Unverify" : "Verify"}</button></form>
                      <Link href={`/evidence#${f.code}`} className="btn btn-sm">Edit</Link>
                      <form action={deleteFact}><input type="hidden" name="factId" value={f.id} /><ConfirmButton message={`Delete ${f.code}?`}>Delete</ConfirmButton></form>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between pt-2">
              <Link href="/onboarding?step=preferences" className="btn btn-sm">← Back</Link>
              <Link href="/dashboard" className="btn btn-primary btn-sm">Finish → Dashboard</Link>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
