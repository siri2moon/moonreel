import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";

/** Storage keys are POSIX-style paths relative to STORAGE_DIR, e.g. `projects/<id>/final.mp4`. */
export function storageRoot() {
  return path.resolve(env().STORAGE_DIR);
}

/** Resolves a key to an absolute path, refusing anything that escapes the storage root. */
export function resolveKey(key: string) {
  const root = storageRoot();
  const abs = path.resolve(root, key);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error(`Invalid storage key: ${key}`);
  }
  return abs;
}

export async function saveFile(key: string, data: Buffer | Uint8Array) {
  const abs = resolveKey(key);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, data);
  return key;
}

export async function readFileByKey(key: string) {
  return readFile(resolveKey(key));
}

/** Public URL served by the /api/files route. */
export function fileUrl(key: string | null | undefined, version?: Date | null) {
  if (!key) return null;
  const v = version ? `?v=${version.getTime()}` : "";
  return `/api/files/${key.split("/").map(encodeURIComponent).join("/")}${v}`;
}

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".srt": "application/x-subrip",
};

export function mimeOf(key: string) {
  return MIME[path.extname(key).toLowerCase()] ?? "application/octet-stream";
}

export async function toDataUrl(key: string) {
  const buf = await readFileByKey(key);
  return `data:${mimeOf(key)};base64,${buf.toString("base64")}`;
}
