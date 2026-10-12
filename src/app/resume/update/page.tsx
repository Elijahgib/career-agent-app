import { redirect } from "next/navigation";
import { Badge, Card, Notice, PageHeader } from "@/components/ui";
import { diffSummary, type DiffStatus } from "@/lib/resume/diff";
import { computePendingDiff } from "@/server/resume-merge";
import { getActiveProfileId } from "@/server/session";
import { applyResumeUpdateAction, cancelResumeUpdateAction } from "../../actions";

export const dynamic = "force-dynamic";

const STATUS: Record<DiffStatus, { tone: "green" | "blue" | "amber" | "gray"; label: string }> = {
  NEW: { tone: "green", label: "New" },
  UPDATED: { tone: "blue", label: "Updated" },
  POSSIBLE_DUPLICATE: { tone: "amber", label: "Possible duplicate" },
  UNCHANGED: { tone: "gray", label: "Unchanged" },
};

export default async function ResumeUpdatePage() {
  const profileId = await getActiveProfileId();
  if (!profileId) redirect("/onboarding");
  const pending = await computePendingDiff(profileId);
  if (!pending) redirect("/resume/review");
  const { diffs, filename, newEducation, newSkills, newCertifications } = pending;
  const s = diffSummary(diffs);
  const nothingNew = diffs.length > 0 && diffs.every((d) => d.status === "UNCHANGED") && newEducation === 0 && newSkills === 0 && newCertifications === 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Review resume changes" subtitle={`We compared ${filename ?? "your new resume"} against your current profile so nothing gets duplicated. Approve what to apply.`} />
      <Notice tone="blue">
        {s.NEW} new role{s.NEW === 1 ? "" : "s"}, {s.UPDATED} updated, {s.POSSIBLE_DUPLICATE} possible duplicate{s.POSSIBLE_DUPLICATE === 1 ? "" : "s"}, {s.UNCHANGED} unchanged. New education, skills and certifications are merged in automatically; existing ones are left alone. Everything applied stays <strong>Unverified</strong>.
      </Notice>

      {nothingNew ? (
        <Notice tone="green">
          <strong>No new changes detected.</strong> Your profile already matches this resume — nothing to add.
          <form action={cancelResumeUpdateAction} className="mt-2"><button className="btn btn-sm">Done</button></form>
        </Notice>
      ) : diffs.length === 0 ? (
        <Notice tone="amber">The new resume didn&apos;t contain any work history we could read. Nothing to merge.</Notice>
      ) : (
        <form action={applyResumeUpdateAction} className="space-y-3">
          {diffs.map((d, i) => {
            const meta = STATUS[d.status];
            return (
              <Card key={i}>
                <label className="flex items-start gap-3">
                  <input type="checkbox" name="approve" value={i} defaultChecked={d.status === "NEW" || d.status === "UPDATED"} disabled={d.status === "UNCHANGED"} className="mt-1" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      <span className="font-medium">{d.incoming.title ?? "(untitled)"} · {d.incoming.employer ?? "(unknown employer)"}</span>
                      <span className="text-xs text-muted">{d.incoming.startDate ?? "?"}–{d.incoming.endDate ?? "present"}</span>
                    </span>
                    <span className="mt-1 block text-sm text-slate-700">{d.note}</span>
                    {d.changes.length > 0 && (
                      <ul className="mt-1 list-disc pl-5 text-xs text-slate-600">{d.changes.map((c, j) => <li key={j}>{c}</li>)}</ul>
                    )}
                    {d.incoming.bullets.length > 0 && (
                      <span className="mt-1 block text-xs text-muted">{d.incoming.bullets.length} duty bullet{d.incoming.bullets.length === 1 ? "" : "s"} (new ones added; existing ones are not duplicated)</span>
                    )}
                  </span>
                </label>
              </Card>
            );
          })}
          <div className="flex items-center justify-between gap-2 pb-8">
            <button formAction={cancelResumeUpdateAction} className="btn btn-ghost">Cancel &amp; discard</button>
            <button className="btn btn-primary">Apply selected changes</button>
          </div>
          {newEducation + newSkills + newCertifications > 0 && (
            <p className="text-xs text-muted">New from this resume to merge: {newEducation} education, {newSkills} skill(s), {newCertifications} certification(s). (Items already in your profile are skipped.)</p>
          )}
        </form>
      )}
    </div>
  );
}
