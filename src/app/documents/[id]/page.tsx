import Link from "next/link";
import { notFound } from "next/navigation";
import { NoProfile } from "@/components/no-profile";
import { Badge, Card, GateBadge, Notice, PageHeader } from "@/components/ui";
import type { Claim } from "@/lib/truth-gate/types";
import { conceptLabel } from "@/lib/ontology/concepts";
import { loadDocument } from "@/server/documents";
import { getSnapshot } from "@/server/profiles";
import { getActiveProfileId } from "@/server/session";
import { editClaimAction, generateDocAction } from "../../actions";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const profileId = await getActiveProfileId();
  if (!profileId) return <NoProfile />;
  const { id } = await params;
  const [stored, snapshot] = await Promise.all([loadDocument(id, profileId), getSnapshot(profileId)]);
  if (!stored || !snapshot) notFound();
  const { doc } = stored;
  const byId = new Map(doc.claims.map((c) => [c.id, c]));
  const fact = (code: string) => snapshot.facts.find((f) => f.code === code);
  const violationsFor = (claimId: string) => doc.gate.violations.filter((v) => v.claimId === claimId);

  function ClaimView({ c, inline = false }: { c: Claim; inline?: boolean }) {
    const vs = violationsFor(c.id);
    const result = doc.gate.claims[c.id];
    const blocked = vs.length > 0;
    const text = c.text.split("\n").map((line, i) => (i ? [<br key={i} />, line] : line));
    if (c.kind === "HEADER") return <span className={inline ? "" : "block"}>{text}</span>;
    return (
      <span className={`prov relative ${inline ? "" : "block"}`}>
        <span className={blocked ? "rounded bg-red-100 ring-1 ring-red-300" : ""}>{text}</span>
        <button type="button" className={`no-print ml-1 align-super text-[10px] ${blocked ? "text-red-700" : "text-brand/60 hover:text-brand"}`} aria-label={blocked ? "Why is this blocked?" : "Why can I say this?"} title={blocked ? "Why is this blocked?" : "Why can I say this?"}>
          {blocked ? "⛔" : "ⓘ"}
        </button>
        <span className="prov-pop no-print absolute left-0 top-full z-20 w-[min(30rem,80vw)] pt-1">
          <span className="block rounded-md border border-line bg-white p-2 font-sans text-xs leading-snug text-slate-700 shadow-lg">
            {blocked ? (
              <span className="block space-y-1 text-red-800">
                {vs.map((v, i) => (
                  <span key={i} className="block"><span className="kbd">{v.rule}</span> {v.message}{v.hint && <span className="block text-teal-800">{v.hint}</span>}</span>
                ))}
              </span>
            ) : c.supportingFactCodes.length ? (
              <>
                <span className="block font-semibold">Why can I say this?</span>
                {c.supportingFactCodes.map((code) => (
                  <span key={code} className="block"><Link href={`/evidence#${code}`} className="kbd">{code}</Link> {fact(code)?.canonicalFact ?? "(fact no longer exists)"} <span className="text-muted">· {fact(code)?.source}</span></span>
                ))}
                {result && Object.keys(result.licensedBy).length > 0 && (
                  <span className="mt-1 block text-muted">Supports: {Object.entries(result.licensedBy).slice(0, 8).map(([k, v]) => `${conceptLabel(k)} (${v.join(", ")})`).join(" · ")}</span>
                )}
                {c.kind === "BRIDGE" && <span className="mt-1 block text-teal-800">Transferable statement: the job part refers to the employer&apos;s role, not your experience.</span>}
                {c.origin === "ai" && <span className="mt-1 block text-violet-800">Reworded by the AI provider and re-checked by the Truth Gate.</span>}
                {c.origin === "user" && <span className="mt-1 block text-violet-800">Edited by you and re-checked by the Truth Gate.</span>}
              </>
            ) : (
              <span className="block">Greeting / role reference — asserts nothing about your experience.</span>
            )}
            {(c.kind === "EXPERIENCE" || c.kind === "SKILL" || c.kind === "SUMMARY" || c.kind === "BRIDGE" || c.kind === "LEARNING") && (
              <form action={editClaimAction} className="mt-2 flex gap-1">
                <input type="hidden" name="documentId" value={stored!.id} />
                <input type="hidden" name="claimId" value={c.id} />
                <input name="text" defaultValue={c.text} className="!py-1 !text-xs" aria-label="Edit this claim" />
                <button className="btn btn-sm">Edit &amp; re-check</button>
              </form>
            )}
          </span>
        </span>
      </span>
    );
  }

  const isResume = doc.kind === "RESUME";
  return (
    <div className="space-y-6">
      <PageHeader
        title={`${doc.title} · v${stored.version}`}
        subtitle={`${stored.provider} engine · ${doc.gate.checkedClaims} claims checked · ${new Date(stored.createdAt).toISOString().slice(0, 16).replace("T", " ")} UTC`}
        actions={
          <>
            <GateBadge status={doc.gate.status} />
            {doc.gate.status === "PASSED" ? (
              <>
                <a className="btn btn-sm" href={`/api/documents/${stored.id}?format=md`}>Download .md</a>
                <a className="btn btn-sm" href={`/api/documents/${stored.id}?format=txt`}>Download .txt</a>
              </>
            ) : (
              stored.jobId && (
                <form action={generateDocAction}>
                  <input type="hidden" name="jobId" value={stored.jobId} />
                  <input type="hidden" name="kind" value={doc.kind} />
                  <button className="btn btn-primary btn-sm">Regenerate safely (template engine)</button>
                </form>
              )
            )}
            {stored.jobId && <Link href={`/jobs/${stored.jobId}`} className="btn btn-sm">Job →</Link>}
          </>
        }
      />

      {doc.gate.status === "BLOCKED" ? (
        <Notice tone="red">
          <strong>Blocked by Truth Gate.</strong> {doc.gate.violations.length} unsupported phrase{doc.gate.violations.length === 1 ? "" : "s"} found. Export is disabled until every highlighted claim is supported:
          <ul className="mt-1 list-disc pl-5">
            {doc.gate.violations.slice(0, 8).map((v, i) => (
              <li key={i}><strong>“{v.phrase}”</strong> — {v.message}</li>
            ))}
          </ul>
        </Notice>
      ) : (
        <Notice tone="green">✓ Every claim cites VERIFIED evidence. Hover or tap the ⓘ after any line to see “Why can I say this?” — the exact evidence behind it. Use your browser&apos;s Print → Save as PDF for a PDF copy.</Notice>
      )}
      {doc.meta.excludedUnverified.length > 0 && (
        <Notice tone="amber">
          Left out because unverified: {doc.meta.excludedUnverified.map((x) => `${x.code} (“${x.text.slice(0, 60)}”)`).join("; ")}. <Link href="/evidence?filter=unverified">Verify in the ledger</Link> to include them.
        </Notice>
      )}
      {[...doc.meta.styleWarnings, ...doc.meta.providerNotes].map((w, i) => <Notice key={i} tone="amber">{w}</Notice>)}

      <article className="print-page card mx-auto max-w-[8.5in] px-10 py-8 text-[14px] leading-relaxed">
        {doc.sections.map((s) => {
          if (s.layout === "header") {
            return (
              <header key={s.id} className={isResume ? "mb-4 border-b border-line pb-3 text-center" : "mb-6"}>
                {s.claimIds.map((id, i) => (
                  <div key={id} className={i === 0 && isResume ? "text-2xl font-semibold" : "text-sm text-slate-600"}>
                    <ClaimView c={byId.get(id)!} />
                  </div>
                ))}
              </header>
            );
          }
          return (
            <section key={s.id} className={isResume ? "mb-4" : "mb-4"}>
              {s.title && <h3 className="mb-1 border-b border-line pb-0.5 text-[13px] font-semibold uppercase tracking-wider text-slate-600">{s.title}</h3>}
              {(s.layout === "paragraph" || s.layout === "letter") && (
                <div>
                  {s.claimIds.map((id, i) => (
                    <span key={id}>{i > 0 ? " " : ""}<ClaimView c={byId.get(id)!} inline /></span>
                  ))}
                </div>
              )}
              {s.layout === "inline-list" && (
                <div className="flex flex-wrap gap-x-1 gap-y-1">
                  {s.claimIds.map((id, i) => (
                    <span key={id}>{i > 0 && <span className="text-slate-400"> · </span>}<ClaimView c={byId.get(id)!} inline /></span>
                  ))}
                </div>
              )}
              {s.layout === "bullets" && (
                <ul className="list-disc space-y-0.5 pl-5">{s.claimIds.map((id) => <li key={id}><ClaimView c={byId.get(id)!} /></li>)}</ul>
              )}
              {s.layout === "positions" &&
                doc.positions.map((p) => (
                  <div key={p.positionId} className="mb-3">
                    <div className="font-semibold"><ClaimView c={byId.get(p.headerClaimId)!} /></div>
                    <ul className="list-disc space-y-0.5 pl-5">{p.bulletClaimIds.map((id) => <li key={id}><ClaimView c={byId.get(id)!} /></li>)}</ul>
                  </div>
                ))}
            </section>
          );
        })}
      </article>

      <Card title="Truth Gate report" subtitle="Machine-readable summary of what was checked.">
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge>{doc.gate.engineVersion}</Badge>
          <Badge>{doc.gate.checkedClaims} claims</Badge>
          <Badge tone={doc.gate.violations.length ? "red" : "green"}>{doc.gate.violations.length} violations</Badge>
          {doc.meta.estimatedLines != null && <Badge>~{doc.meta.estimatedLines} lines{doc.meta.onePageTarget ? " (one-page target)" : ""}</Badge>}
        </div>
      </Card>
    </div>
  );
}
