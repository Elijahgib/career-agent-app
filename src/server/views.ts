import { computeSkillGaps } from "@/lib/skills/gaps";
import { analysisFor } from "./jobs";
import { ensureMatches } from "./matching";
import { refreshNotifications } from "./notifications";

/** Shared page data: fresh matches + notifications + skill gaps for the active profile. */
export async function loadWorkspace(profileId: string) {
  const now = new Date();
  const { snapshot, scored } = await ensureMatches(profileId, now);
  await refreshNotifications(profileId, scored, now);
  const gaps = computeSkillGaps(
    snapshot,
    scored.map((s) => ({ job: s.job, analysis: analysisFor(s.job), match: s.match, rejected: s.verdict === "REJECTED" })),
  );
  return { snapshot, scored, gaps, now };
}
