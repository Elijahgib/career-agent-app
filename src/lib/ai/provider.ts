// AI provider abstraction. The deterministic template provider is the default
// and needs no key. Any configured AI provider may only REWORD a single verified
// fact; its output is validated by the Truth Gate like any other text, and an
// unsupported phrase blocks the document instead of being silently accepted.

export interface RewriteRequest {
  factCode: string;
  factText: string;
  allowedWording: string[];
  prohibitedExpansions: string[];
  /** Verified, job-relevant phrases the bullet may emphasise. */
  emphasis: string[];
  jobTitle?: string;
}

export interface AIProvider {
  readonly name: "template" | "anthropic" | "openai";
  readonly label: string;
  /** Data leaves the machine when this is true. */
  readonly remote: boolean;
  rewriteBullet(req: RewriteRequest): Promise<string>;
}

export const SYSTEM_PROMPT = `You reword one resume bullet so it reads well for a specific job.

Hard rules — the output is machine-checked and rejected if any rule is broken:
- Use ONLY information in the FACT. Do not add tools, software, systems, environments, channels (phone/chat/email), certifications, job titles, team sizes, metrics, percentages, outcomes or responsibilities that are not in the FACT.
- You may reorder, tighten, and swap in phrases from ALLOWED WORDING.
- Never use any phrase from PROHIBITED.
- Never use leadership or outcome words (led, managed, owned, improved, reduced, increased, spearheaded) unless the FACT uses them.
- Keep numbers exactly as written in the FACT.
- Past tense, no first person, no trailing period, at most 28 words.
Return only the bullet text.`;

export function userPrompt(req: RewriteRequest): string {
  return [
    `FACT (${req.factCode}): ${req.factText}`,
    `ALLOWED WORDING: ${req.allowedWording.join("; ") || "(none)"}`,
    `PROHIBITED: ${req.prohibitedExpansions.join("; ") || "(none)"}`,
    `EMPHASISE IF PRESENT IN THE FACT: ${req.emphasis.join("; ") || "(none)"}`,
    req.jobTitle ? `TARGET ROLE: ${req.jobTitle}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function cleanModelLine(text: string): string {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)[0]
    ?.replace(/^[-•*]\s*/, "")
    .replace(/^"|"$/g, "")
    .trim() ?? "";
}

/** Deterministic, offline. Returns the verified canonical fact unchanged. */
export class TemplateProvider implements AIProvider {
  readonly name = "template" as const;
  readonly label = "Template engine (offline, deterministic)";
  readonly remote = false;
  async rewriteBullet(req: RewriteRequest): Promise<string> {
    return req.factText.replace(/\.\s*$/, "");
  }
}
