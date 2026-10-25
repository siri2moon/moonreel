import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";
import { mimeOf, resolveKey } from "@/lib/storage";

// Serves generated media from local storage, with Range support so videos can seek.
export async function GET(req: NextRequest, ctx: RouteContext<"/api/files/[...path]">) {
  const { path: parts } = await ctx.params;
  const key = parts.join("/");

  let abs: string;
  let size: number;
  try {
    abs = resolveKey(key);
    const info = await stat(abs);
    if (!info.isFile()) throw new Error("not a file");
    size = info.size;
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers({
    "Content-Type": mimeOf(key),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  });
  if (req.nextUrl.searchParams.has("download")) {
    headers.set("Content-Disposition", `attachment; filename="${parts.at(-1)}"`);
  }

  const range = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(end - start + 1));
    const stream = Readable.toWeb(createReadStream(abs, { start, end })) as ReadableStream;
    return new Response(stream, { status: 206, headers });
  }

  headers.set("Content-Length", String(size));
  return new Response(Readable.toWeb(createReadStream(abs)) as ReadableStream, { headers });
}
