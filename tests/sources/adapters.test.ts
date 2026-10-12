import { describe, expect, it } from "vitest";
import { ashbyAdapter } from "@/lib/sources/ashby";
import { networkEnabled, safeFetcher } from "@/lib/sources/fetcher";
import { greenhouseAdapter } from "@/lib/sources/greenhouse";
import { detectSourceFromUrl } from "@/lib/sources";
import { careerPageAdapter, extractJobPostings } from "@/lib/sources/jsonld";
import { leverAdapter } from "@/lib/sources/lever";
import type { FetchLike } from "@/lib/sources/types";
import { ASHBY_BOARD, CAREER_PAGE_HTML, GREENHOUSE_LIST, LEVER_LIST } from "../fixtures/ats";

function fakeFetch(routes: Record<string, { status?: number; body: unknown }>): FetchLike & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (url: string) => {
    calls.push(url);
    const hit = Object.entries(routes).find(([k]) => url.startsWith(k));
    const status = hit ? hit[1].status ?? 200 : 404;
    const body = hit?.[1].body ?? {};
    return { ok: status < 400, status, json: async () => body, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) };
  }) as FetchLike & { calls: string[] };
  fn.calls = calls;
  return fn;
}

describe("Greenhouse adapter", () => {
  it("lists and normalises public board postings", async () => {
    const f = fakeFetch({ "https://boards-api.greenhouse.io/v1/boards/examplecorp/jobs?content=true": { body: GREENHOUSE_LIST } });
    const jobs = await greenhouseAdapter.list("examplecorp", f);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({ sourceType: "GREENHOUSE", externalId: "4001001", title: "IT Support Technician", location: "Austin, TX", employmentType: "FULL_TIME", reqId: "REQ-77" });
    expect(jobs[0].description).toContain("- Troubleshoot printers & peripherals");
    expect(jobs[0].postedAt?.toISOString()).toBe("2026-09-30T14:00:00.000Z");
    expect(jobs[1].remoteType).toBe("REMOTE");
    expect(jobs[0].structured.salary).toBe(false);
  });
  it("returns null for a posting that no longer exists", async () => {
    const f = fakeFetch({});
    expect(await greenhouseAdapter.get("examplecorp", "999", f)).toBeNull();
  });
});

describe("Lever adapter", () => {
  it("normalises postings including structured salary and workplace type", async () => {
    const f = fakeFetch({ "https://api.lever.co/v0/postings/examplelever?mode=json": { body: LEVER_LIST } });
    const [j] = await leverAdapter.list("examplelever", f);
    expect(j).toMatchObject({ sourceType: "LEVER", title: "Field Service Technician", remoteType: "ONSITE", employmentType: "FULL_TIME", salaryMin: 50000, salaryMax: 58000, salaryPeriod: "YEAR" });
    expect(j.structured).toMatchObject({ salary: true, remoteType: true, location: true });
    expect(j.description).toContain("- 2+ years of hardware repair experience");
  });
});

describe("Ashby adapter", () => {
  it("skips unlisted jobs and reads compensation", async () => {
    const f = fakeFetch({ "https://api.ashbyhq.com/posting-api/job-board/exampleashby": { body: ASHBY_BOARD } });
    const jobs = await ashbyAdapter.list("exampleashby", f);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ title: "Desktop Support Specialist", remoteType: "ONSITE", salaryMin: 52000, salaryPeriod: "YEAR", employmentType: "FULL_TIME" });
  });
});

describe("career page (schema.org JobPosting)", () => {
  it("extracts JobPosting JSON-LD and ignores malformed blocks", async () => {
    expect(extractJobPostings(CAREER_PAGE_HTML)).toHaveLength(1);
    const f = fakeFetch({ "https://careers.example.com/jobs": { body: CAREER_PAGE_HTML } });
    const [j] = await careerPageAdapter.list("https://careers.example.com/jobs", f);
    expect(j).toMatchObject({ sourceType: "CAREER_PAGE", company: "Example Cafe Co", location: "Austin, TX", salaryMin: 21, salaryMax: 25, salaryPeriod: "HOUR", externalId: "ECC-12" });
    expect(j.description).toContain("Support POS systems");
  });
});

describe("URL detection", () => {
  it("routes ATS links to structured APIs", () => {
    expect(detectSourceFromUrl("https://boards.greenhouse.io/examplecorp/jobs/4001001")).toEqual({ type: "GREENHOUSE", identifier: "examplecorp", externalId: "4001001" });
    expect(detectSourceFromUrl("https://jobs.lever.co/examplelever/abc")).toEqual({ type: "LEVER", identifier: "examplelever", externalId: "abc" });
    expect(detectSourceFromUrl("https://jobs.ashbyhq.com/exampleashby")).toMatchObject({ type: "ASHBY", identifier: "exampleashby" });
    expect(detectSourceFromUrl("https://careers.example.com/jobs/1")?.type).toBe("CAREER_PAGE");
    expect(detectSourceFromUrl("not a url")).toBeNull();
  });
});

describe("safe fetcher", () => {
  it("is off unless explicitly enabled", async () => {
    expect(networkEnabled({})).toBe(false);
    await expect(safeFetcher({})("https://example.com")).rejects.toThrow(/disabled/);
  });
  it("refuses private-network and non-http targets even when enabled", async () => {
    const f = safeFetcher({ JOB_SOURCES_NETWORK: "on" });
    await expect(f("http://127.0.0.1:3000/")).rejects.toThrow(/Private-network/);
    await expect(f("http://192.168.1.10/")).rejects.toThrow(/Private-network/);
    await expect(f("file:///etc/passwd")).rejects.toThrow(/http/);
  });
});
