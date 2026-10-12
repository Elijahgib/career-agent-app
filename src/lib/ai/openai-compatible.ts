import { SYSTEM_PROMPT, cleanModelLine, userPrompt, type AIProvider, type RewriteRequest } from "./provider";

/**
 * Any OpenAI-compatible chat-completions endpoint (OpenAI, a local Ollama or
 * LM Studio server, etc.). With a localhost OPENAI_BASE_URL nothing leaves
 * the machine.
 */
export class OpenAICompatibleProvider implements AIProvider {
  readonly name = "openai" as const;
  readonly label: string;
  readonly remote: boolean;

  constructor(private opts: { apiKey?: string; baseUrl: string; model: string }) {
    this.remote = !/localhost|127\.0\.0\.1/.test(opts.baseUrl);
    this.label = `OpenAI-compatible (${opts.model} @ ${new URL(opts.baseUrl).host})`;
  }

  async rewriteBullet(req: RewriteRequest): Promise<string> {
    const res = await fetch(`${this.opts.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.opts.apiKey ? { authorization: `Bearer ${this.opts.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.opts.model,
        temperature: 0.2,
        max_tokens: 200,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt(req) },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`AI provider returned HTTP ${res.status}`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const line = cleanModelLine(json.choices?.[0]?.message?.content ?? "");
    if (!line) throw new Error("The AI provider returned no text.");
    return line;
  }
}
