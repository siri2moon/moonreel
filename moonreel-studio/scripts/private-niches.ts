import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { nicheFormatEnum, type Niche } from "@/db/schema";
import { env } from "@/lib/env";
import { THUMBNAIL_STYLES } from "@/lib/thumbnail-styles";

/**
 * Private niches: one JSON file per niche in NICHES_DIR (default ~/.moonreel/niches), outside
 * the repository like the rest of your data. `pnpm db:seed` inserts them alongside the
 * sample niches, and `pnpm niches:export` writes the niches you made in the app back here.
 */
export function nichesDir() {
  return path.resolve(env().NICHES_DIR);
}

const lines = z.union([z.string(), z.array(z.string())]).transform((v) => (Array.isArray(v) ? v.join("\n") : v));

export const nicheFileSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  icon: z.string().default("✦"),
  format: z.enum(nicheFormatEnum.enumValues).default("story"),
  fixedCamera: z.boolean().default(false),
  description: z.string().default(""),
  scriptInstructions: lines,
  tone: z.string().default(""),
  visualStyle: z.string().default(""),
  sceneCount: z.number().int().min(1).max(40),
  sceneSeconds: z.number().int().min(4).max(10),
  language: z.string().min(1),
  defaultAspectRatio: z.enum(["9:16", "16:9"]).default("9:16"),
  narratorVoiceId: z.string().nullable().default(null),
  thumbnailStyle: z.enum(THUMBNAIL_STYLES).default("impact"),
  thumbnailAccent: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#FFC23D"),
  thumbnailBrand: z.string().default(""),
  postsInstructions: lines.default(""),
  // The Page's access token is never written to a niche file; connect it again in the niche form.
  facebookPageId: z.string().nullable().default(null),
});

export type NicheFile = z.infer<typeof nicheFileSchema>;

export async function readPrivateNiches(): Promise<NicheFile[]> {
  const dir = nichesDir();
  const files = await readdir(dir).catch(() => [] as string[]);
  return Promise.all(
    files
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map(async (f) => {
        const raw = JSON.parse(await readFile(path.join(dir, f), "utf8"));
        const parsed = nicheFileSchema.safeParse(raw);
        if (!parsed.success) throw new Error(`${path.join(dir, f)}: ${parsed.error.message}`);
        return parsed.data;
      }),
  );
}

/** A niche row as a readable file: instructions one line per array item, no DB-only fields. */
export function toNicheFile(n: Niche) {
  return {
    slug: n.slug,
    name: n.name,
    icon: n.icon,
    format: n.format,
    fixedCamera: n.fixedCamera,
    description: n.description,
    scriptInstructions: n.scriptInstructions.split("\n"),
    tone: n.tone,
    visualStyle: n.visualStyle,
    sceneCount: n.sceneCount,
    sceneSeconds: n.sceneSeconds,
    language: n.language,
    defaultAspectRatio: n.defaultAspectRatio,
    narratorVoiceId: n.narratorVoiceId,
    thumbnailStyle: n.thumbnailStyle,
    thumbnailAccent: n.thumbnailAccent,
    thumbnailBrand: n.thumbnailBrand,
    postsInstructions: n.postsInstructions ? n.postsInstructions.split("\n") : "",
    facebookPageId: n.facebookPageId,
  };
}

export async function writeNicheFile(n: Niche) {
  const dir = nichesDir();
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${n.slug}.json`);
  await writeFile(file, JSON.stringify(toNicheFile(n), null, 2) + "\n");
  return file;
}
