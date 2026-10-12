// Compare a freshly parsed resume against the profile's existing work history so a re-upload
// NEVER blindly duplicates roles. Pure and testable.
import type { ParsedPosition } from "./parse";

export type DiffStatus = "UNCHANGED" | "UPDATED" | "NEW" | "POSSIBLE_DUPLICATE";

export interface ExistingPosition {
  id: string;
  employer: string;
  title: string;
  startDate: string;
  endDate: string | null;
}

export interface PositionDiff {
  status: DiffStatus;
  incoming: ParsedPosition;
  existingId?: string;
  note: string;
  changes: string[];
}

function norm(s?: string | null): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Loose equality: equal, or one clearly contains the other (e.g. "NCR" vs "NCR Voyix"). */
function sameish(a?: string | null, b?: string | null): boolean {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const short = x.length <= y.length ? x : y;
  const long = x.length <= y.length ? y : x;
  return short.length >= 3 && long.includes(short);
}

export function diffPositions(incoming: ParsedPosition[], existing: ExistingPosition[]): PositionDiff[] {
  const used = new Set<string>();
  const out: PositionDiff[] = [];
  for (const inc of incoming) {
    const empMatches = existing.filter((e) => !used.has(e.id) && sameish(e.employer, inc.employer));
    const exact = empMatches.find((e) => sameish(e.title, inc.title));
    const match = exact ?? empMatches[0];

    if (!match) {
      out.push({ status: "NEW", incoming: inc, note: "New work experience detected.", changes: [] });
      continue;
    }
    used.add(match.id);

    const changes: string[] = [];
    if (inc.title && norm(match.title) !== norm(inc.title)) changes.push(`title: “${match.title}” → “${inc.title}”`);
    if (inc.startDate && (match.startDate ?? "") !== inc.startDate) changes.push(`start date: ${match.startDate} → ${inc.startDate}`);
    const incEnd = inc.endDate ?? null;
    const curEnd = match.endDate ?? null;
    if (incEnd !== curEnd && (inc.startDate || inc.endDate !== undefined)) changes.push(`end date: ${curEnd ?? "present"} → ${incEnd ?? "present"}`);

    if (!exact && empMatches.length > 0 && inc.title) {
      // Same employer, different title: a second role there, or a relisting — let the user decide.
      out.push({ status: "POSSIBLE_DUPLICATE", incoming: inc, existingId: match.id, note: "Same employer, different title — possible duplicate or a second role. Review before adding.", changes });
      continue;
    }
    if (changes.length === 0) {
      out.push({ status: "UNCHANGED", incoming: inc, existingId: match.id, note: "Already in your profile — no changes.", changes });
      continue;
    }
    const endChanged = changes.some((c) => c.startsWith("end date"));
    out.push({ status: "UPDATED", incoming: inc, existingId: match.id, note: endChanged ? "Updated end date detected." : "Updated details detected.", changes });
  }
  return out;
}

export function diffSummary(diffs: PositionDiff[]): Record<DiffStatus, number> {
  const s: Record<DiffStatus, number> = { UNCHANGED: 0, UPDATED: 0, NEW: 0, POSSIBLE_DUPLICATE: 0 };
  for (const d of diffs) s[d.status]++;
  return s;
}
