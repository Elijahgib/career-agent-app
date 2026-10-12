import { exportProfile } from "@/server/export";
import { listProfiles } from "@/server/profiles";

// Local, single-user MVP: any local profile can be exported from this machine.
// With real accounts this must check ownership (see docs/ARCHITECTURE.md).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const known = (await listProfiles()).some((p) => p.id === id);
  if (!known) return new Response("Not found", { status: 404 });
  const data = await exportProfile(id);
  if (!data) return new Response("Not found", { status: 404 });
  const name = data.profile.displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="career-agent-${name}-${new Date().toISOString().slice(0, 10)}.json"` },
  });
}
