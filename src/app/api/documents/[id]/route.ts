import { renderText } from "@/lib/documents/render";
import { loadDocument } from "@/server/documents";
import { getActiveProfileId } from "@/server/session";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const profileId = await getActiveProfileId();
  const { id } = await params;
  if (!profileId) return new Response("No profile", { status: 401 });
  const stored = await loadDocument(id, profileId);
  if (!stored) return new Response("Not found", { status: 404 });
  if (stored.doc.gate.status !== "PASSED") return new Response("Blocked by Truth Gate — fix the unsupported claims before exporting.", { status: 409 });
  const format = new URL(req.url).searchParams.get("format") === "txt" ? "text" : "markdown";
  const body = renderText(stored.doc, format);
  const name = `${stored.doc.kind.toLowerCase()}-v${stored.version}.${format === "text" ? "txt" : "md"}`;
  return new Response(body, { headers: { "content-type": `${format === "text" ? "text/plain" : "text/markdown"}; charset=utf-8`, "content-disposition": `attachment; filename="${name}"` } });
}
