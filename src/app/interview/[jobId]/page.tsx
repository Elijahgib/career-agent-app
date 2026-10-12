import Link from "next/link";
import { notFound } from "next/navigation";
import { NoProfile } from "@/components/no-profile";
import { Badge, Card, GateBadge, PageHeader, ReqStatusBadge } from "@/components/ui";
import { generatePrep } from "@/server/documents";
import { getJob } from "@/server/jobs";
import { getActiveProfileId } from "@/server/session";

export default async function InterviewPrepPage({ params }: { params: Promise<{ jobId: string }> }) {
  const profileId = await getActiveProfileId();
  if (!profileId) return <NoProfile />;
  const { jobId } = await params;
  const job = await getJob(jobId);
  if (!job) notFound();
  const prep = await generatePrep(profileId, jobId);
  const claim = (id?: string) => prep.claims.find((c) => c.id === id);
  const blocked = (id?: string) => prep.gate.violations.some((v) => v.claimId === id);

  const Script = ({ id }: { id?: string }) => {
    const c = claim(id);
    if (!c) return null;
    return (
      <blockquote className={`border-l-4 pl-3 text-sm italic ${blocked(id) ? "border-red-400 text-red-800" : "border-emerald-400 text-slate-800"}`}>
        “{c.text}”
        {c.supportingFactCodes.length > 0 && <span className="ml-1 text-xs not-italic text-muted">[{c.supportingFactCodes.join(", ")}]</span>}
      </blockquote>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Interview prep: ${prep.jobTitle}`}
        subtitle={`${prep.company}. Every script below is checked by the Truth Gate — say what you did, not what the posting wants to hear.`}
        actions={<><GateBadge status={prep.gate.status} /><Link href={`/jobs/${jobId}`} className="btn btn-sm">Job →</Link></>}
      />

      <Card title="Likely questions">
        <div className="space-y-4">
          {prep.likelyQuestions.map((q) => (
            <div key={q.question}>
              <div className="font-medium">{q.question}</div>
              <div className="text-xs text-muted">{q.why}</div>
              <p className="mt-1 text-sm">{q.framework}</p>
              {q.scriptClaimId && <div className="mt-1"><Script id={q.scriptClaimId} /></div>}
              {q.evidence.length > 0 && (
                <ul className="mt-1 text-xs text-slate-600">
                  {q.evidence.map((e) => <li key={e.code}><span className="kbd">{e.code}</span> {e.text}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Technical questions you can answer from experience">
          <div className="space-y-4">
            {prep.technicalQuestions.length ? prep.technicalQuestions.map((t) => (
              <div key={t.conceptId}>
                <div className="flex items-center gap-2"><span className="font-medium">{t.label}</span> <ReqStatusBadge status={t.status} /></div>
                <div className="text-sm">{t.question}</div>
                <div className="text-xs text-muted">{t.guidance}</div>
                {t.scriptClaimIds.map((id) => <div key={id} className="mt-1"><Script id={id} /></div>)}
              </div>
            )) : <p className="muted">No verified matches for this posting&apos;s technical requirements.</p>}
          </div>
        </Card>
        <Card title="Hard-gap questions — answer honestly" subtitle="“I haven't supported that professionally yet. My approach would be…”">
          <div className="space-y-4">
            {prep.hardGapQuestions.map((t) => (
              <div key={t.conceptId}>
                <div className="flex items-center gap-2"><span className="font-medium">{t.label}</span> <ReqStatusBadge status={t.status} /></div>
                <div className="text-sm">{t.question}</div>
                {t.scriptClaimIds.map((id) => <div key={id} className="mt-1"><Script id={id} /></div>)}
                <div className="mt-1 text-xs text-muted">{t.guidance}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="STAR stories from verified history" subtitle="Fill the situation and result with the real details. Do not add numbers you can't verify.">
        <div className="grid gap-4 md:grid-cols-2">
          {prep.starStories.map((s) => (
            <div key={s.factCode} className="rounded-lg border border-line p-3 text-sm">
              <div className="mb-1 font-medium"><span className="kbd">{s.factCode}</span> {s.title}</div>
              <div><strong>S:</strong> {s.situation}</div>
              <div><strong>T:</strong> {s.task}</div>
              <div><strong>A:</strong></div>
              <Script id={s.actionClaimId} />
              <div><strong>R:</strong> {s.result}</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Do not claim" subtitle="These would overstate your evidence.">
          <ul className="space-y-1.5 text-sm">
            {prep.doNotClaim.map((d) => (
              <li key={d.phrase}><Badge tone="red">✕ {d.phrase}</Badge> <span className="text-xs text-slate-600">{d.reason}{d.factCodes.length ? ` (${d.factCodes.join(", ")})` : ""}</span></li>
            ))}
          </ul>
        </Card>
        <Card title="Questions to ask the employer">
          <ul className="list-disc space-y-1 pl-5 text-sm">{prep.questionsToAsk.map((q) => <li key={q}>{q}</li>)}</ul>
        </Card>
      </div>
    </div>
  );
}
