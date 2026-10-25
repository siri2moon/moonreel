import os from "node:os";
import path from "node:path";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  MUSE2API_BASE_URL: z.string().url().default("http://localhost:18610"),
  MUSE2API_KEY: z.string().min(1),
  MUSE_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(1),
  STORAGE_DIR: z.string().default(path.join(os.homedir(), ".moonreel", "storage")),
});

let cached: z.infer<typeof schema> | undefined;

// Parsed lazily so `next build` does not require runtime secrets.
export function env() {
  cached ??= schema.parse(process.env);
  return cached;
}
