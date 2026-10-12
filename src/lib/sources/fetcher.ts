import type { FetchLike } from "./types";
import { SourceError } from "./types";

/** True only when the user opted in to outbound job-source fetching. */
export function networkEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env.JOB_SOURCES_NETWORK ?? "off").toLowerCase() === "on";
}

/**
 * Safe fetch for public job feeds: opt-in, GET only, timeout, size cap,
 * honest User-Agent, no cookies, http(s) only, no private-network targets.
 * Never sends any candidate data.
 */
export function safeFetcher(env: Record<string, string | undefined> = process.env): FetchLike {
  const timeout = Number(env.JOB_FETCH_TIMEOUT_MS ?? 10000);
  const ua = env.JOB_FETCH_USER_AGENT ?? "career-agent-app/0.1 (+local; personal job search)";
  return async (url, init) => {
    if (!networkEnabled(env)) throw new SourceError("Outbound job-source fetching is disabled. Set JOB_SOURCES_NETWORK=on in .env to enable it.");
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) throw new SourceError("Only http(s) URLs are allowed.");
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|\[?::1\]?)/.test(u.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(u.hostname)) {
      throw new SourceError("Private-network URLs are not allowed.");
    }
    const res = await fetch(url, {
      method: "GET",
      headers: { "user-agent": ua, accept: "application/json, text/html;q=0.9", ...(init?.headers ?? {}) },
      redirect: "follow",
      credentials: "omit",
      signal: init?.signal ?? AbortSignal.timeout(timeout),
    });
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > 15_000_000) throw new SourceError("Response too large.");
    return res;
  };
}
