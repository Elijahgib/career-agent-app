import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, cleanModelLine, userPrompt, type AIProvider, type RewriteRequest } from "./provider";

/**
 * Anthropic Messages API provider. Only used when AI_PROVIDER=anthropic and
 * ANTHROPIC_API_KEY is set. Sends one verified fact + its allowed/prohibited
 * wording per call — never the whole profile, contact details or other facts.
 */
export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic" as const;
  readonly remote = true;
  readonly label: string;
  private client: Anthropic;
  private model: string;

  constructor(opts: { apiKey: string; model?: string }) {
    this.client = new Anthropic({ apiKey: opts.apiKey, timeout: 60_000, maxRetries: 2 });
    this.model = opts.model || "claude-opus-5-5";
    this.label = `Anthropic (${this.model})`;
  }

  async rewriteBullet(req: RewriteRequest): Promise<string> {
    // Server-side fallback re-runs a safety-declined request on Anthropic's
    // recommended model instead of failing the generation.
    const params = {
      model: this.model,
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt(req) }],
    };
    const response = await this.client.beta.messages.create(params as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming);
    if (response.stop_reason === "refusal") {
      throw new Error("The AI provider declined this request; regenerate with the template engine.");
    }
    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n");
    const line = cleanModelLine(text);
    if (!line) throw new Error("The AI provider returned no text.");
    return line;
  }
}
