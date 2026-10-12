import type { GeneratedDocument } from "./types";

/** Plain-text / Markdown rendering for export. Provenance stays internal. */
export function renderText(doc: GeneratedDocument, format: "text" | "markdown" = "text"): string {
  const byId = new Map(doc.claims.map((c) => [c.id, c]));
  const t = (id: string) => byId.get(id)?.text ?? "";
  const md = format === "markdown";
  const lines: string[] = [];
  for (const s of doc.sections) {
    if (s.layout === "header") {
      s.claimIds.forEach((id, i) => lines.push(i === 0 && md && doc.kind === "RESUME" ? `# ${t(id)}` : t(id)));
      lines.push("");
      continue;
    }
    if (s.title) lines.push(md ? `## ${s.title}` : s.title.toUpperCase());
    if (s.layout === "paragraph" || s.layout === "letter") lines.push(s.claimIds.map(t).join(" "));
    else if (s.layout === "inline-list") lines.push(s.claimIds.map(t).join(" · "));
    else if (s.layout === "bullets") for (const id of s.claimIds) lines.push(`- ${t(id)}`);
    else if (s.layout === "positions") {
      for (const p of doc.positions) {
        lines.push(md ? `**${t(p.headerClaimId)}**` : t(p.headerClaimId));
        for (const id of p.bulletClaimIds) lines.push(`- ${t(id)}`);
        lines.push("");
      }
    }
    lines.push("");
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
