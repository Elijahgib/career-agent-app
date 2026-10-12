import { createHash } from "node:crypto";
import type { EmploymentType, RemoteType } from "@/lib/domain/types";

const COMPANY_SUFFIXES = /\b(inc|incorporated|llc|l\.l\.c|ltd|limited|corp|corporation|co|company|plc|gmbh|pbc|the)\b\.?/g;

export function normalizeCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(COMPANY_SUFFIXES, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\(.*?\)/g, " ") // req ids, shift info
    .replace(/\bsr\.?\b/g, "senior")
    .replace(/\bjr\.?\b/g, "junior")
    .replace(/\btech\b/g, "technician")
    .replace(/[^a-z0-9+#]+/g, " ")
    .replace(/\b(req|job|id)\s*\d+\b/g, " ")
    .trim();
}

export function normalizeLocation(loc?: string | null): string {
  if (!loc) return "";
  return loc
    .toLowerCase()
    .replace(/\b(united states|usa|us)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Stable dedupe key: same company + title + location = same job, regardless of source. */
export function dedupeKey(company: string, title: string, location?: string | null): string {
  const raw = `${normalizeCompany(company)}|${normalizeTitle(title)}|${normalizeLocation(location)}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " " };

export function decodeEntities(s: string): string {
  return s
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/** HTML → readable plain text that keeps list items and headings on their own lines. */
export function htmlToText(html: string): string {
  let s = decodeEntities(html); // Greenhouse double-encodes
  s = s
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "\n- ")
    .replace(/<\s*\/(p|div|h[1-6]|ul|ol|li|section|tr)\s*>/gi, "\n")
    .replace(/<\s*(h[1-6])[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  return s
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter((l, i, arr) => l || (i > 0 && arr[i - 1]))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function annualize(amount: number | null | undefined, period?: "YEAR" | "HOUR" | null): number | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  return period === "HOUR" ? Math.round(amount * 2080) : Math.round(amount);
}

export function formatSalary(min?: number | null, max?: number | null, period?: "YEAR" | "HOUR" | null, currency = "USD"): string {
  if (min == null && max == null) return "Not listed";
  const sym = currency === "USD" ? "$" : `${currency} `;
  const fmt = (n: number) => (period === "HOUR" ? `${sym}${n % 1 ? n.toFixed(2) : n}` : `${sym}${Math.round(n / 1000)}k`);
  const range = min != null && max != null && min !== max ? `${fmt(min)}–${fmt(max)}` : fmt((min ?? max)!);
  return period === "HOUR" ? `${range}/hr` : range;
}

export function parseEmploymentType(raw?: string | null): EmploymentType {
  if (!raw) return "UNKNOWN";
  const s = raw.toLowerCase();
  if (/intern/.test(s)) return "INTERNSHIP";
  if (/part[\s_-]?time/.test(s)) return "PART_TIME";
  if (/temp|seasonal/.test(s)) return "TEMP";
  if (/contract|contractor|freelance|1099|c2h/.test(s)) return "CONTRACT";
  if (/full[\s_-]?time|permanent|fulltime/.test(s)) return "FULL_TIME";
  return "UNKNOWN";
}

export function parseRemoteType(raw?: string | null): RemoteType {
  if (!raw) return "UNKNOWN";
  const s = raw.toLowerCase();
  if (/hybrid/.test(s)) return "HYBRID";
  if (/remote|telecommute|work from home|wfh/.test(s)) return "REMOTE";
  if (/on[\s-]?site|in[\s-]?office|onsite/.test(s)) return "ONSITE";
  return "UNKNOWN";
}
