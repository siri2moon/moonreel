import { getProvider } from "@/lib/providers";

export async function GET() {
  try {
    const muse = await getProvider().health();
    return Response.json({ ok: muse.status === "ready", muse }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
