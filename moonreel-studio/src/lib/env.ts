import os from "node:os";
import path from "node:path";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  MUSE2API_BASE_URL: z.string().url().default("http://localhost:18610"),
  MUSE2API_KEY: z.string().min(1),
  MUSE_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(1),
  // Cloudflare AI Gateway for script writing; when unset, Muse writes the scripts.
  CF_AIG_ACCOUNT_ID: z.string().optional(),
  CF_AIG_GATEWAY_ID: z.string().optional(),
  CF_AIG_BASE_URL: z.string().url().optional(),
  CF_AIG_TOKEN: z.string().optional(),
  CF_AIG_PROVIDER_KEY: z.string().optional(),
  CF_AIG_BYOK_ALIAS: z.string().optional(),
  SCRIPT_MODEL: z.string().default("deepseek/deepseek-chat"),
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_MODEL: z.string().default("eleven_multilingual_v2"),
  STORAGE_DIR: z.string().default(path.join(os.homedir(), ".moonreel", "storage")),
  // Your own niches as JSON files, kept out of the repository (see scripts/private-niches.ts).
  NICHES_DIR: z.string().default(path.join(os.homedir(), ".moonreel", "niches")),
});

let cached: z.infer<typeof schema> | undefined;

// Parsed lazily so `next build` does not require runtime secrets.
export function env() {
  cached ??= schema.parse(process.env);
  return cached;
}
