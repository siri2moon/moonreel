import type { NextRequest } from "next/server";
import { getProjectView } from "@/lib/views";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/projects/[id]">) {
  const { id } = await ctx.params;
  const view = await getProjectView(id);
  if (!view) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(view, { headers: { "Cache-Control": "no-store" } });
}
