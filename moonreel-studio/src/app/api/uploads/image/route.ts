import { randomUUID } from "node:crypto";
import path from "node:path";
import type { NextRequest } from "next/server";
import sharp from "sharp";
import { REFERENCE_EXTENSIONS, REFERENCE_MAX_BYTES } from "@/lib/reference-image";
import { saveFile } from "@/lib/storage";

// Large enough for Muse to read the place, small enough to send as a data URL with every image.
const MAX_SIDE = 1600;

/**
 * Stores a photo of the place for an ambient video. The raw request body is the image
 * (?name= gives its original name). It is turned upright, scaled down and saved as JPEG.
 */
export async function POST(req: NextRequest) {
  const ext = path.extname(req.nextUrl.searchParams.get("name") ?? "").toLowerCase();
  if (!(REFERENCE_EXTENSIONS as readonly string[]).includes(ext)) {
    return Response.json({ error: `Unsupported image type; use ${REFERENCE_EXTENSIONS.join(", ")}` }, { status: 415 });
  }
  if (Number(req.headers.get("content-length") ?? 0) > REFERENCE_MAX_BYTES) {
    return Response.json({ error: "Image is larger than 25 MB" }, { status: 413 });
  }

  try {
    const data = Buffer.from(await req.arrayBuffer());
    if (data.length === 0 || data.length > REFERENCE_MAX_BYTES) throw new Error("Image is empty or larger than 25 MB");
    const jpeg = await sharp(data)
      .rotate()
      .resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
    const key = await saveFile(`uploads/images/${randomUUID()}.jpg`, jpeg);
    return Response.json({ key });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
