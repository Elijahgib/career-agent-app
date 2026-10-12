import Link from "next/link";
import { NoProfile } from "@/components/no-profile";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { suggestCareers } from "@/lib/matching/career";
import { getActiveProfileId } from "@/server/session";
import { loadWorkspace } from "@/server/views";

const CAREER_TIER_LABEL = { GOOD_TRANSITION: "Good transition", REALISTIC_STRETCH: "Realistic stretch", LONGER_TERM: "Longer-term path" } as const;

export default async function SkillsPage() {
  const profileId = await getActiveProfileId();
  if (!profileId) return <NoProfile />;
  const { gaps, snapshot } = await loadWorkspace(profileId);
  const careers = suggestCareers(snapshot, { limit: 6 });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Skill & certification plan"
        subtitle={`Ranked by frequency × job quality × salary upside ÷ effort, across ${gaps.jobsConsidered} job${gaps.jobsConsidered === 1 ? "" : "s"} you'd consider (SKIP and rejected jobs excluded). Certifications are suggested only when the jobs in front of you ask for them.`}
      />
      {careers.length > 0 && (
        <Card title="Career directions" subtitle="Based on your verified experience — realistic roles to aim for and exactly what you'd still need. Nothing here is suggested from a keyword; it all comes from verified evidence.">
          <div className="grid gap-3 md:grid-cols-2">
            {careers.map((c) => (
              <div key={c.id} className="rounded-lg border border-line p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{c.label}</span>
                  <Badge tone={c.tier === "GOOD_TRANSITION" ? "green" : c.tier === "REALISTIC_STRETCH" ? "amber" : "gray"}>{CAREER_TIER_LABEL[c.tier]}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted">{c.rationale}</p>
                <div className="mt-2 text-xs"><span className="font-semibold text-emerald-800">You have:</span> {c.have.join(", ")}</div>
                {c.missing.length > 0 && <div className="mt-1 text-xs"><span className="font-semibold text-red-800">Still to build:</span> {c.missing.join(", ")}</div>}
              </div>
            ))}
          </div>
        </Card>
      )}
      {gaps.quickWins.length > 0 && (
        <Card title="Quick wins: verify what you may already have">
          <ul className="space-y-1 text-sm">
            {gaps.quickWins.map((q) => (
              <li key={q.label}>
                <strong>{q.label}</strong> appears in {q.jobs} job{q.jobs === 1 ? "" : "s"} and matches unverified {q.factCodes.map((c) => <Link key={c} href={`/evidence?filter=unverified#${c}`} className="kbd mx-0.5">{c}</Link>)}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {gaps.recommendations.length === 0 && <Empty>No recurring gaps among jobs you&apos;d consider. Import more jobs to build a plan.</Empty>}
      <div className="space-y-3">
        {gaps.recommendations.slice(0, 15).map((r, i) => (
          <Card
            key={r.conceptId}
            title={<span>{i + 1}. {r.label}</span>}
            subtitle={r.rationale}
            actions={<><Badge tone="blue">priority {r.priority}</Badge><Badge>effort {r.effort}/5</Badge>{Object.entries(r.statuses).map(([k, v]) => <Badge key={k} tone={k === "HARD_GAP" ? "red" : k === "TRANSFERABLE" ? "teal" : k === "LEARNING_ONLY" ? "purple" : "gray"}>{v} {k.toLowerCase().replace("_", " ")}</Badge>)}</>}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <ul className="space-y-1 text-sm">
                {r.actions.map((a, j) => (
                  <li key={j}><Badge tone={a.type === "certification" ? "purple" : a.type === "verify" ? "amber" : "green"}>{a.type}</Badge> {a.text}</li>
                ))}
              </ul>
              <ul className="space-y-0.5 text-xs text-muted">
                {r.jobs.slice(0, 6).map((j) => <li key={j.jobId}><Link href={`/jobs/${j.jobId}`}>{j.title}</Link> · {j.company}</li>)}
              </ul>
            </div>
            <p className="mt-2 text-xs text-muted">When you complete a lab or course, add it to the Evidence Ledger as a LEARNING or PROJECT fact — it will show as learning, never as job experience.</p>
          </Card>
        ))}
      </div>
      {gaps.notTrainable.length > 0 && (
        <Card title="Gaps study can't close" subtitle="Shown for honesty — these come from employer sponsorship or time in role.">
          <ul className="space-y-1 text-sm">{gaps.notTrainable.map((n) => <li key={n.conceptId}><strong>{n.label}</strong> ({n.frequency} job{n.frequency === 1 ? "" : "s"}) — {n.note}</li>)}</ul>
        </Card>
      )}
    </div>
  );
}
