import { AnthropicProvider } from "./anthropic";
import { OpenAICompatibleProvider } from "./openai-compatible";
import { TemplateProvider, type AIProvider } from "./provider";

export type { AIProvider, RewriteRequest } from "./provider";
export { TemplateProvider } from "./provider";

export interface ProviderStatus {
  configured: AIProvider["name"];
  active: AIProvider["name"];
  label: string;
  remote: boolean;
  warning?: string;
}

/** Resolve the provider from environment variables. Never throws; falls back to the template engine. */
export function resolveProvider(env: Record<string, string | undefined> = process.env): { provider: AIProvider; status: ProviderStatus } {
  const configured = (env.AI_PROVIDER ?? "template").toLowerCase();
  const template = new TemplateProvider();
  const fallback = (warning: string) => ({
    provider: template,
    status: { configured: configured as AIProvider["name"], active: "template" as const, label: template.label, remote: false, warning },
  });
  if (configured === "anthropic") {
    if (!env.ANTHROPIC_API_KEY) return fallback("AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set — using the template engine.");
    const p = new AnthropicProvider({ apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL });
    return { provider: p, status: { configured: "anthropic", active: "anthropic", label: p.label, remote: true } };
  }
  if (configured === "openai") {
    const baseUrl = env.OPENAI_BASE_URL || "https://api.openai.com/v1";
    const isLocal = /localhost|127\.0\.0\.1/.test(baseUrl);
    if (!env.OPENAI_API_KEY && !isLocal) return fallback("AI_PROVIDER=openai but OPENAI_API_KEY is not set — using the template engine.");
    const p = new OpenAICompatibleProvider({ apiKey: env.OPENAI_API_KEY, baseUrl, model: env.OPENAI_MODEL || "gpt-4o-mini" });
    return { provider: p, status: { configured: "openai", active: "openai", label: p.label, remote: p.remote } };
  }
  return { provider: template, status: { configured: "template", active: "template", label: template.label, remote: false } };
}
