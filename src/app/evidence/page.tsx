import Link from "next/link";
import { ClaimChecker, ConfirmButton } from "@/components/client";
import { NoProfile } from "@/components/no-profile";
import { ResumeDropzone } from "@/components/resume-dropzone";
import { Badge, Card, Notice, PageHeader, VerifBadge } from "@/components/ui";
import { categoryLabel, experienceTypeLabel } from "@/lib/labels";
import { RELATIONS, type LedgerFact, type Relation } from "@/lib/domain/types";
import { licenseForFact, licensedConceptIds, suggestProhibitedExpansions } from "@/lib/evidence/ledger";
import { EXPERIENCE_RELATIONS, LEARNING_RELATIONS, RELATION_INFO, describeRelations } from "@/lib/evidence/relations";
import { conceptLabel, getConcept } from "@/lib/ontology/concepts";
import { db } from "@/server/db";
import { getSnapshot } from "@/server/profiles";
import { getActiveProfileId } from "@/server/session";
import { addFact, addProhibited, checkClaimAction, deleteFact, setFactVerification, updateFact } from "../actions";

const CATEGORIES = ["DUTY", "ACHIEVEMENT", "SKILL", "TOOL", "CERTIFICATION", "LICENSE", "PROJECT", "LEARNING", "SOFT_SKILL", "CLEARANCE"];
const EXP_TYPES = ["PROFESSIONAL", "VOLUNTEER", "ACADEMIC", "PROJECT", "LEARNING"];

function relationTone(rels: Set<Relation>): "green" | "purple" | "amber" {
  if ([...rels].some((r) => EXPERIENCE_RELATIONS.has(r))) return "green";
  if ([...rels].some((r) => LEARNING_RELATIONS.has(r))) return "purple";
  return "amber";
}

/** Explicit relationship checkboxes. Ticking one can only narrow what the wording supports. */
function RelationPicker({ selected }: { selected: Relation[] }) {
  return (
    <fieldset className="field md:col-span-2">
      <input type="hidden" name="relationsField" value="1" />
      <label>Relationship to the subject (optional — leave empty to infer it from the wording; it can only narrow, never strengthen)</label>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {RELATIONS.map((r) => (
          <label key={r} className="inline-flex items-center gap-1 font-normal" title={RELATION_INFO[r].description}>
            <input type="checkbox" name="relations" value={r} defaultChecked={selected.includes(r)} /> {RELATION_INFO[r].label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function FactCard({ f, positions }: { f: LedgerFact; positions: Map<string, string> }) {
  const says = licensedConceptIds(f).filter((id) => getConcept(id)?.kind !== "title");
  const suggestions = suggestProhibitedExpansions(f).slice(0, 6);
  const lic = licenseForFact(f);
  const wordingIssue = (w: string) => lic.wordingIssues.find((i) => i.phrase === w);
  return (
    <div id={f.code} className="rounded-lg border border-line bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="kbd">{f.code}</span>
            <VerifBadge status={f.verificationStatus} />
            <Badge tone={f.experienceType === "PROFESSIONAL" || f.experienceType === "VOLUNTEER" ? "blue" : "purple"}>{experienceTypeLabel(f.experienceType)}</Badge>
            <Badge>{categoryLabel(f.category)}</Badge>
            <span className="text-muted">{f.positionId ? positions.get(f.positionId) : f.context ?? "No context"}</span>
          </div>
          <p className="mt-1.5 text-[15px]">{f.canonicalFact}</p>
          <div className="mt-1 text-xs text-muted">
            Source: {f.source} · confidence {f.confidence.toLowerCase()} · relationship:{" "}
            {f.relations.length ? (
              <span>
                {describeRelations(f.relations.filter((r) => !lic.analysis.ignoredExplicit.includes(r))) || "—"} (set by you)
                {lic.analysis.ignoredExplicit.length > 0 && (
                  <span className="text-amber-700" title="Explicit relationships can only narrow what the wording shows.">
                    {" "}· ignored: {describeRelations(lic.analysis.ignoredExplicit)} — the wording doesn&apos;t show it
                  </span>
                )}
              </span>
            ) : (
              <span>inferred from the wording</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <form action={setFactVerification}>
            <input type="hidden" name="factId" value={f.id} />
            <input type="hidden" name="status" value={f.verificationStatus === "VERIFIED" ? "UNVERIFIED" : "VERIFIED"} />
            <button className={`btn btn-sm ${f.verificationStatus === "VERIFIED" ? "" : "btn-primary"}`}>{f.verificationStatus === "VERIFIED" ? "Unverify" : "Verify"}</button>
          </form>
          <form action={deleteFact}>
            <input type="hidden" name="factId" value={f.id} />
            <ConfirmButton message={`Delete ${f.code}? Documents that cite it will no longer validate.`}>Delete</ConfirmButton>
          </form>
        </div>
      </div>
      <div className="mt-2 grid gap-2 text-xs md:grid-cols-3">
        <div>
          <div className="font-semibold text-slate-600">Lets the app say</div>
          <div className="mt-1 flex flex-wrap gap-1">{says.length ? (
              says.map((id) => {
                const rels = lic.relations.get(id) ?? new Set<Relation>();
                return (
                  <Badge key={id} tone={relationTone(rels)} title={[...rels].map((r) => RELATION_INFO[r].description).join("; ")}>
                    {conceptLabel(id)} · {describeRelations(rels) || "mentioned"}
                  </Badge>
                );
              })
            ) : (
              <span className="text-muted">Only this exact wording</span>
            )}</div>
        </div>
        <div>
          <div className="font-semibold text-slate-600">Allowed wording</div>
          <div className="mt-1 flex flex-wrap gap-1">{f.allowedWording.length
              ? f.allowedWording.map((w) => {
                  const issue = wordingIssue(w);
                  return issue ? (
                    <Badge key={w} tone="red" title={`Claims ${RELATION_INFO[issue.asserted].label} ${conceptLabel(issue.conceptId)}, but this fact only shows ${describeRelations(issue.allowed) || "a mention"}. Ignored by the Truth Gate.`}>
                      <s>{w}</s> · stronger than the fact
                    </Badge>
                  ) : (
                    <Badge key={w} tone="blue">{w}</Badge>
                  );
                })
              : <span className="text-muted">—</span>}</div>
        </div>
        <div>
          <div className="font-semibold text-slate-600">Prohibited expansions</div>
          <div className="mt-1 flex flex-wrap gap-1">{f.prohibitedExpansions.length ? f.prohibitedExpansions.map((w) => <Badge key={w} tone="red">{w}</Badge>) : <span className="text-muted">—</span>}</div>
          {suggestions.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <span className="text-muted">Commonly overstated as:</span>
              {suggestions.map((s) => (
                <form key={s} action={addProhibited}>
                  <input type="hidden" name="factId" value={f.id} />
                  <input type="hidden" name="phrase" value={s} />
                  <button className="chip border-red-200 bg-white text-red-700 hover:bg-red-50" title="Add as a prohibited expansion">+ {s}</button>
                </form>
              ))}
            </div>
          )}
        </div>
      </div>
      {!f.derived && (
        <details className="mt-2">
          <summary className="text-xs text-brand">Edit</summary>
          <form action={updateFact} className="mt-2 grid gap-2 md:grid-cols-2">
            <input type="hidden" name="factId" value={f.id} />
            <div className="field md:col-span-2">
              <label>Canonical fact (changing it, the category, the experience type or widening the relationship resets verification)</label>
              <textarea name="canonicalFact" rows={2} defaultValue={f.canonicalFact} />
            </div>
            <div className="field"><label>Allowed wording (comma or newline separated)</label><textarea name="allowedWording" rows={2} defaultValue={f.allowedWording.join("\n")} /></div>
            <div className="field"><label>Prohibited expansions</label><textarea name="prohibitedExpansions" rows={2} defaultValue={f.prohibitedExpansions.join("\n")} /></div>
            <div className="field"><label>Category</label><select name="category" defaultValue={f.category}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div className="field"><label>Experience type</label><select name="experienceType" defaultValue={f.experienceType}>{EXP_TYPES.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div className="field"><label>Source</label><input name="source" defaultValue={f.source} /></div>
            <div className="field"><label>Confidence</label><select name="confidence" defaultValue={f.confidence}><option>HIGH</option><option>MEDIUM</option><option>LOW</option></select></div>
            <RelationPicker selected={f.relations} />
            <div><button className="btn btn-primary btn-sm">Save fact</button></div>
          </form>
        </details>
      )}
    </div>
  );
}

export default async function EvidencePage({ searchParams }: { searchParams: Promise<{ filter?: string; imported?: string; error?: string; detail?: string; notice?: string }> }) {
  const profileId = await getActiveProfileId();
  if (!profileId) return <NoProfile />;
  const sp = await searchParams;
  const snapshot = await getSnapshot(profileId);
  if (!snapshot) return <NoProfile />;
  const positions = await db.position.findMany({ where: { profileId }, orderBy: { startDate: "desc" } });
  const posLabel = new Map(positions.map((p) => [p.id, `${p.title} · ${p.employer}`]));
  const stored = snapshot.facts.filter((f) => !f.derived);
  const derived = snapshot.facts.filter((f) => f.derived);
  const filter = sp.filter ?? "all";
  const shown = stored.filter((f) => (filter === "unverified" ? f.verificationStatus !== "VERIFIED" : filter === "verified" ? f.verificationStatus === "VERIFIED" : filter === "learning" ? !["PROFESSIONAL", "VOLUNTEER"].includes(f.experienceType) : true));
  const unverifiedCount = stored.filter((f) => f.verificationStatus !== "VERIFIED").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Evidence Ledger"
        subtitle="Every generated claim must cite a VERIFIED fact here. Allowed wording widens what may be said; prohibited expansions narrow it. Nothing outside this ledger can appear in a document."
      />
      {sp.imported && <Notice tone="amber">Imported {sp.imported} line(s) as UNVERIFIED facts. Review each one, fix the wording, and verify only what you can back up.</Notice>}
      {sp.notice && <Notice tone="green">{sp.notice} Review each one below and verify only what you can back up.</Notice>}
      {sp.error === "resume" && <Notice tone="red">Couldn&apos;t import that resume. {sp.detail ?? "Upload a PDF, DOCX, TXT or MD file, or paste the text."}</Notice>}

      <Card title="Truth Gate claim checker" subtitle="Test any sentence against your evidence — the same gate that validates generated documents.">
        <ClaimChecker action={checkClaimAction} facts={snapshot.facts.map((f) => ({ code: f.code, text: f.canonicalFact, verified: f.verificationStatus === "VERIFIED" }))} />
      </Card>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="muted">Show:</span>
        {[
          ["all", `All (${stored.length})`],
          ["unverified", `Unverified (${unverifiedCount})`],
          ["verified", "Verified"],
          ["learning", "Learning / academic"],
        ].map(([k, label]) => (
          <Link key={k} href={`/evidence?filter=${k}`} className={`btn btn-sm ${filter === k ? "btn-primary" : ""}`}>
            {label}
          </Link>
        ))}
      </div>

      <div className="space-y-3">{shown.map((f) => <FactCard key={f.code} f={f} positions={posLabel} />)}</div>

      <Card title="Derived facts" subtitle="Created automatically from verified work history and education. They license job titles, employers, dates and credentials.">
        <ul className="space-y-1 text-sm">
          {derived.map((f) => (
            <li key={f.code} className="flex flex-wrap items-center gap-2">
              <span className="kbd">{f.code}</span> <VerifBadge status={f.verificationStatus} /> {f.canonicalFact}
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Add a fact" className="scroll-mt-20">
          <form id="add" action={addFact} className="grid gap-3">
            <div className="field">
              <label>Canonical fact — what you actually did, in plain words</label>
              <textarea name="canonicalFact" rows={2} placeholder="Diagnosed and repaired POS systems, printers and scanners at retail stores." required />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="field">
                <label>Position (context)</label>
                <select name="positionId" defaultValue="">
                  <option value="">— none (learning, project, credential) —</option>
                  {positions.map((p) => <option key={p.id} value={p.id}>{p.title} · {p.employer}</option>)}
                </select>
              </div>
              <div className="field"><label>Other context (school, lab…)</label><input name="context" /></div>
              <div className="field"><label>Category</label><select name="category" defaultValue="DUTY">{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
              <div className="field"><label>Experience type</label><select name="experienceType" defaultValue="PROFESSIONAL">{EXP_TYPES.map((c) => <option key={c}>{c}</option>)}</select></div>
            </div>
            <div className="field"><label>Allowed wording (comma separated)</label><input name="allowedWording" placeholder="hardware troubleshooting, printer support" /></div>
            <div className="field"><label>Prohibited expansions (comma separated)</label><input name="prohibitedExpansions" placeholder="enterprise desktop support, PC imaging" /></div>
            <RelationPicker selected={[]} />
            <div className="grid gap-3 md:grid-cols-2">
              <div className="field"><label>Source</label><input name="source" placeholder="Self-reported, manager reference, certificate…" /></div>
              <div className="field"><label>Confidence</label><select name="confidence" defaultValue="MEDIUM"><option>HIGH</option><option>MEDIUM</option><option>LOW</option></select></div>
            </div>
            <label className="flex items-center gap-2"><input type="checkbox" name="verified" /> Verified — I can back this up exactly as written</label>
            <div><button className="btn btn-primary">Add fact</button></div>
          </form>
        </Card>
        <Card title="Import from a resume" subtitle="Upload a PDF, DOCX, TXT or MD file — or paste text. Parsed locally (never sent to any AI). Work history, education, skills and certifications import as unverified facts for review.">
          <ResumeDropzone returnTo="evidence" withPaste />
        </Card>
      </div>
    </div>
  );
}
