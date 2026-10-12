import { ashbyAdapter } from "./ashby";
import { greenhouseAdapter } from "./greenhouse";
import { careerPageAdapter } from "./jsonld";
import { leverAdapter } from "./lever";
import type { SourceAdapter, SourceType } from "./types";

export * from "./types";
export { networkEnabled, safeFetcher } from "./fetcher";

export const ADAPTERS: Partial<Record<SourceType, SourceAdapter>> = {
  GREENHOUSE: greenhouseAdapter,
  LEVER: leverAdapter,
  ASHBY: ashbyAdapter,
  CAREER_PAGE: careerPageAdapter,
};

/** Recognise ATS URLs so a pasted link can use the structured API instead of scraping. */
export function detectSourceFromUrl(raw: string): { type: SourceType; identifier: string; externalId?: string } | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const parts = u.pathname.split("/").filter(Boolean);
  if (/(^|\.)greenhouse\.io$/.test(u.hostname)) {
    const jobsIdx = parts.indexOf("jobs");
    const token = u.searchParams.get("for") ?? parts[0];
    const id = u.searchParams.get("gh_jid") ?? (jobsIdx >= 0 ? parts[jobsIdx + 1] : undefined);
    if (token) return { type: "GREENHOUSE", identifier: token, externalId: id };
  }
  if (u.hostname === "jobs.lever.co" && parts[0]) return { type: "LEVER", identifier: parts[0], externalId: parts[1] };
  if (u.hostname === "jobs.ashbyhq.com" && parts[0]) return { type: "ASHBY", identifier: parts[0], externalId: parts[1] };
  return { type: "CAREER_PAGE", identifier: raw };
}
