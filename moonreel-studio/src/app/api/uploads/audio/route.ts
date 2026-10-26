import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import type { NextRequest } from "next/server";
import { probe } from "@/lib/pipeline/render";
import { AUDIO_EXTENSIONS, AUDIO_MAX_BYTES } from "@/lib/soundtrack";
import { resolveKey } from "@/lib/storage";

/**
 * Stores a soundtrack for an ambient video. The file is the raw request body (?name= gives
 * its original name) and is streamed straight to disk, so hour-long tracks never sit in memory.
 * Lives under /api, outside the proxy, whose body limit would cut large files short.
 */
export async function POST(req: NextRequest) {
  const ext = path.extname(req.nextUrl.searchParams.get("name") ?? "").toLowerCase();
  if (!(AUDIO_EXTENSIONS as readonly string[]).includes(ext)) {
    return Response.json({ error: `Unsupported audio type; use ${AUDIO_EXTENSIONS.join(", ")}` }, { status: 415 });
  }
  if (Number(req.headers.get("content-length") ?? 0) > AUDIO_MAX_BYTES || !req.body) {
    return Response.json({ error: "File is empty or larger than 1 GB" }, { status: 413 });
  }

  const key = `uploads/audio/${randomUUID()}${ext}`;
  const abs = resolveKey(key);
  await mkdir(path.dirname(abs), { recursive: true });
  let received = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      received += chunk.length;
      done(received > AUDIO_MAX_BYTES ? new Error("File is larger than 1 GB") : null, chunk);
    },
  });

  try {
    await pipeline(Readable.fromWeb(req.body as WebReadableStream), limit, createWriteStream(abs));
    const info = await probe(abs);
    if (!info.hasAudio) throw new Error("The file has no audio track");
    return Response.json({ key, duration: info.duration });
  } catch (err) {
    await rm(abs, { force: true });
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
