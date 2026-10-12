import type { ClassifiedEmail, EmailMessage, EmailSignalType, StatusSuggestion } from "./types";

const RULES: { type: EmailSignalType; re: RegExp; weight: number }[] = [
  { type: "OFFER", re: /\b(offer letter|pleased to offer|extend (you )?an offer|job offer|offer of employment)\b/i, weight: 0.9 },
  { type: "REJECTION", re: /\b(not (be )?moving forward|decided to (move|proceed) with other|unfortunately|regret to inform|position has been filled|will not be proceeding|not selected)\b/i, weight: 0.85 },
  { type: "INTERVIEW", re: /\b(schedule (an|a|your) (interview|call|phone screen)|interview (invitation|request)|invite you to (an )?interview|availability for (a|an) (call|interview)|phone screen)\b/i, weight: 0.8 },
  { type: "CONFIRMATION", re: /\b(thank you for (applying|your application)|application (has been )?received|we('ve| have) received your application|application submitted)\b/i, weight: 0.75 },
];

/** Rule-based, local classification. No message content leaves the machine. */
export function classifyEmail(m: EmailMessage, knownCompanies: string[] = []): ClassifiedEmail {
  const text = `${m.subject}\n${m.body}`;
  let type: EmailSignalType = "UNKNOWN";
  let confidence = 0.2;
  for (const r of RULES) {
    if (r.re.test(text)) {
      type = r.type;
      confidence = r.weight;
      break;
    }
  }
  const fromDomain = m.from.split("@")[1]?.toLowerCase() ?? null;
  const company =
    knownCompanies.find((c) => text.toLowerCase().includes(c.toLowerCase().replace(/\s*\(demo\)\s*$/, ""))) ??
    text.match(/\b(?:at|from|with) ([A-Z][A-Za-z0-9&.' ]{2,40}?)(?:[.,!\n]| team| for )/)?.[1]?.trim() ??
    null;
  const role = text.match(/\b(?:for the|for our|the) ([A-Z][A-Za-z0-9/&() -]{3,60}?) (?:position|role|opening)\b/)?.[1]?.trim() ?? null;
  if (type !== "UNKNOWN" && !company) confidence -= 0.25;
  return { messageId: m.id, type, confidence: Math.max(0, Math.round(confidence * 100) / 100), company, role, fromDomain, subject: m.subject, receivedAt: m.receivedAt };
}

const STATUS_FOR: Record<EmailSignalType, StatusSuggestion["suggestedStatus"]> = {
  CONFIRMATION: "APPLIED",
  INTERVIEW: "INTERVIEW",
  REJECTION: "REJECTED",
  OFFER: "OFFER",
  UNKNOWN: null,
};

export function suggestStatus(c: ClassifiedEmail, applications: { id: string; company: string; role: string; status: string }[]): StatusSuggestion {
  const norm = (s: string) => s.toLowerCase().replace(/\s*\(demo\)\s*$/, "").replace(/[^a-z0-9]+/g, " ").trim();
  const candidates = applications.filter((a) => c.company && (norm(a.company).includes(norm(c.company)) || norm(c.company).includes(norm(a.company))));
  const app = candidates.length === 1 ? candidates[0] : candidates.find((a) => c.role && norm(a.role) === norm(c.role)) ?? null;
  const suggested = STATUS_FOR[c.type];
  return {
    messageId: c.messageId,
    applicationId: app?.id ?? null,
    suggestedStatus: suggested,
    requiresConfirmation: true,
    reason: app
      ? `Looks like a ${c.type.toLowerCase()} email from ${c.company} (confidence ${Math.round(c.confidence * 100)}%).`
      : c.company
        ? `Looks like a ${c.type.toLowerCase()} email from ${c.company}, but no matching application was found.`
        : "Could not identify the company — review manually.",
  };
}
