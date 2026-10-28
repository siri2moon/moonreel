"use server";

import { and, count, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import path from "node:path";
import { z } from "zod";
import { db } from "@/db";
import { NICHE_COOKIE } from "@/lib/active-niche";
import { hasLocale, LOCALE_COOKIE } from "@/i18n/config";
import { getActionDictionary } from "@/i18n/action";
import { characters, nicheCharacters, niches, projectCharacters, projects, scenes, shorts } from "@/db/schema";
import {
  enqueueCharacterReference,
  enqueuePosts,
  enqueueRender,
  enqueueScenes,
  enqueueScript,
  enqueueShortRenders,
  enqueueShortsPlan,
  enqueueThumbnail,
} from "@/lib/queue";
import { mediaDuration } from "@/lib/pipeline/render";
import { REFERENCE_KEY } from "@/lib/reference-image";
import { MAX_PROJECT_SCENES } from "@/lib/pipeline/prompts";
import { pauseScenes } from "@/lib/production";
import { SOUNDTRACK_KEY } from "@/lib/soundtrack";
import { THUMBNAIL_STYLES } from "@/lib/thumbnail-styles";
import { resolveKey, saveFile } from "@/lib/storage";

/** Largest cast a project (or a niche's default cast) can have. */
const MAX_CAST = 8;

/** An ordered cast posted as comma-separated character ids, lead first. */
const castIdsSchema = z
  .string()
  .default("")
  .transform((v) => [...new Set(v.split(",").filter(Boolean))])
  .pipe(z.array(z.uuid()).max(MAX_CAST));

// ---------------------------------------------------------------- niches

const nicheSchema = z.object({
  name: z.string().trim().min(1),
  slug: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "slug: lowercase letters, numbers and hyphens only"),
  icon: z.string().trim().min(1).max(8).default("✦"),
  format: z.enum(["story", "ambient"]).default("story"),
  // An unchecked checkbox is simply missing from the form data.
  fixedCamera: z
    .string()
    .optional()
    .transform((v) => v === "on"),
  description: z.string().trim().default(""),
  scriptInstructions: z.string().trim().min(1),
  tone: z.string().trim().default(""),
  visualStyle: z.string().trim().default(""),
  sceneCount: z.coerce.number().int().min(1).max(40),
  sceneSeconds: z.coerce.number().int().min(4).max(10),
  language: z.string().trim().min(1),
  defaultAspectRatio: z.enum(["9:16", "16:9"]).default("9:16"),
  defaultCastIds: castIdsSchema,
  narratorVoiceId: z
    .string()
    .trim()
    .default("")
    .transform((v) => v || null),
  thumbnailStyle: z.enum(THUMBNAIL_STYLES).default("impact"),
  thumbnailAccent: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "accent: a colour like #FFC23D")
    .default("#FFC23D"),
  thumbnailBrand: z.string().trim().max(32).default(""),
  postsInstructions: z.string().trim().default(""),
});

async function setActiveNiche(id: string) {
  (await cookies()).set(NICHE_COOKIE, id, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
  });
}

export async function selectNiche(id: string) {
  await setActiveNiche(id);
  redirect("/");
}

export async function saveNiche(id: string | null, formData: FormData) {
  const { defaultCastIds, ...data } = nicheSchema.parse(Object.fromEntries(formData));
  const nicheId = await db.transaction(async (tx) => {
    const [row] = id
      ? await tx.update(niches).set(data).where(eq(niches.id, id)).returning({ id: niches.id })
      : await tx.insert(niches).values(data).returning({ id: niches.id });
    await tx.delete(nicheCharacters).where(eq(nicheCharacters.nicheId, row.id));
    if (defaultCastIds.length) {
      await tx
        .insert(nicheCharacters)
        .values(defaultCastIds.map((characterId, position) => ({ nicheId: row.id, characterId, position })));
    }
    return row.id;
  });
  if (id) {
    revalidatePath("/", "layout");
    redirect("/niches");
  }
  // A freshly created niche becomes the active one: that is why it was created.
  await setActiveNiche(nicheId);
  redirect("/");
}

export async function deleteNiche(id: string) {
  const [{ total }] = await db
    .select({ total: count() })
    .from(projects)
    .where(eq(projects.nicheId, id));
  if (total > 0) {
    throw new Error((await getActionDictionary()).errors.nicheHasVideos(total));
  }
  await db.delete(niches).where(eq(niches.id, id));
  const store = await cookies();
  if (store.get(NICHE_COOKIE)?.value === id) store.delete(NICHE_COOKIE);
  revalidatePath("/", "layout");
  redirect("/niches");
}

// ------------------------------------------------------------ characters

const characterSchema = z.object({
  name: z.string().trim().min(1),
  appearance: z.string().trim().min(1),
  personality: z.string().trim().default(""),
  referenceMode: z.enum(["keep", "upload", "generate"]).default("keep"),
});

const IMAGE_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

export async function saveCharacter(id: string | null, formData: FormData) {
  const { referenceMode, ...fields } = characterSchema.parse({
    name: formData.get("name"),
    appearance: formData.get("appearance"),
    personality: formData.get("personality") ?? "",
    referenceMode: formData.get("referenceMode") ?? "keep",
  });

  const [row] = id
    ? await db.update(characters).set(fields).where(eq(characters.id, id)).returning()
    : await db.insert(characters).values(fields).returning();

  if (referenceMode === "upload") {
    const file = formData.get("referenceImage");
    if (!(file instanceof File) || file.size === 0) {
      throw new Error((await getActionDictionary()).errors.noReferenceImage);
    }
    const ext = IMAGE_EXT[file.type] ?? (path.extname(file.name) || ".png");
    const key = await saveFile(
      `characters/${row.id}/reference${ext}`,
      Buffer.from(await file.arrayBuffer()),
    );
    await db
      .update(characters)
      .set({ referenceImagePath: key, referenceStatus: "ready", referenceError: null })
      .where(eq(characters.id, row.id));
  } else if (referenceMode === "generate") {
    await db
      .update(characters)
      .set({ referenceStatus: "generating", referenceError: null })
      .where(eq(characters.id, row.id));
    await enqueueCharacterReference(row.id);
  }

  revalidatePath("/", "layout");
  redirect("/characters");
}

export async function deleteCharacter(id: string) {
  await db.delete(characters).where(eq(characters.id, id));
  revalidatePath("/", "layout");
  redirect("/characters");
}

// -------------------------------------------------------------- projects

const projectSchema = z.object({
  topic: z.string().trim().min(3),
  // Missing or empty: the niche's count.
  sceneCount: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().min(1).max(MAX_PROJECT_SCENES).optional(),
  ),
  nicheId: z.uuid(),
  castIds: castIdsSchema,
  aspectRatio: z.enum(["9:16", "16:9"]),
  audioPath: z
    .union([z.string().regex(SOUNDTRACK_KEY), z.literal("")])
    .default("")
    .transform((v) => v || null),
  referenceImagePath: z
    .union([z.string().regex(REFERENCE_KEY), z.literal("")])
    .default("")
    .transform((v) => v || null),
});

export async function createProject(formData: FormData) {
  const { castIds, ...data } = projectSchema.parse(Object.fromEntries(formData));
  const niche = await db.query.niches.findFirst({
    where: eq(niches.id, data.nicheId),
    columns: { format: true },
  });
  if (niche?.format === "ambient" && !data.audioPath) {
    throw new Error((await getActionDictionary()).errors.noSoundtrack);
  }
  const audioSeconds = data.audioPath ? await mediaDuration(resolveKey(data.audioPath)) : null;
  const row = await db.transaction(async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({ ...data, audioSeconds, title: data.topic.slice(0, 80), status: "scripting" })
      .returning({ id: projects.id });
    if (castIds.length) {
      await tx
        .insert(projectCharacters)
        .values(castIds.map((characterId, position) => ({ projectId: project.id, characterId, position })));
    }
    return project;
  });
  await enqueueScript(row.id);
  redirect(`/projects/${row.id}`);
}

export async function regenerateScript(projectId: string) {
  await db
    .update(projects)
    .set({ status: "scripting", error: null })
    .where(eq(projects.id, projectId));
  await enqueueScript(projectId);
  revalidatePath(`/projects/${projectId}`);
}

const sceneInputSchema = z.array(
  z.object({
    narration: z.string().trim().min(1),
    visualPrompt: z.string().trim().min(1),
    camera: z.string().trim().default(""),
    characterIds: z.array(z.uuid()).max(MAX_CAST).default([]),
  }),
);

export type SceneInput = z.input<typeof sceneInputSchema>[number];

async function replaceScenes(projectId: string, title: string, input: SceneInput[]) {
  const parsed = sceneInputSchema.min(1).parse(input);
  return db.transaction(async (tx) => {
    await tx.delete(scenes).where(eq(scenes.projectId, projectId));
    await tx.update(projects).set({ title: title.trim() || "Untitled" }).where(eq(projects.id, projectId));
    return tx
      .insert(scenes)
      .values(parsed.map((s, index) => ({ ...s, projectId, index })))
      .returning({ id: scenes.id });
  });
}

export async function saveScript(projectId: string, title: string, input: SceneInput[]) {
  await replaceScenes(projectId, title, input);
  revalidatePath(`/projects/${projectId}`);
}

export async function approveAndProduce(projectId: string, title: string, input: SceneInput[]) {
  const inserted = await replaceScenes(projectId, title, input);
  await db
    .update(projects)
    .set({ status: "producing", error: null, finalVideoPath: null, captionsPath: null })
    .where(eq(projects.id, projectId));
  await enqueueScenes(inserted.map((s) => s.id));
  revalidatePath(`/projects/${projectId}`);
}

/** Stops a project's production; see pauseScenes. */
export async function pauseProduction(projectId: string) {
  await pauseScenes(projectId);
  revalidatePath(`/projects/${projectId}`);
}

export async function retryScenes(
  projectId: string,
  sceneIds: string[],
  opts: { newKeyframe: boolean },
) {
  if (sceneIds.length === 0) return;
  await db.transaction(async (tx) => {
    await tx
      .update(scenes)
      .set({
        status: "pending",
        error: null,
        clipPath: null,
        ...(opts.newKeyframe ? { keyframePath: null } : {}),
      })
      .where(and(eq(scenes.projectId, projectId), inArray(scenes.id, sceneIds)));
    await tx
      .update(projects)
      .set({ status: "producing", error: null })
      .where(eq(projects.id, projectId));
  });
  await enqueueScenes(sceneIds);
  revalidatePath(`/projects/${projectId}`);
}

/** Rewrites one scene after production (e.g. Muse refused it) and queues it again. */
export async function editScene(
  projectId: string,
  sceneId: string,
  input: SceneInput,
  opts: { newKeyframe: boolean },
) {
  const fields = sceneInputSchema.element.parse(input);
  const updated = await db.transaction(async (tx) => {
    const rows = await tx
      .update(scenes)
      .set({
        ...fields,
        status: "pending",
        error: null,
        clipPath: null,
        ...(opts.newKeyframe ? { keyframePath: null } : {}),
      })
      .where(and(eq(scenes.id, sceneId), eq(scenes.projectId, projectId)))
      .returning({ id: scenes.id });
    if (rows.length === 0) return false;
    await tx
      .update(projects)
      .set({ status: "producing", error: null, finalVideoPath: null, captionsPath: null })
      .where(eq(projects.id, projectId));
    return true;
  });
  if (!updated) return;
  await enqueueScenes([sceneId]);
  revalidatePath(`/projects/${projectId}`);
}

export async function rerender(projectId: string) {
  await db.update(projects).set({ status: "rendering", error: null }).where(eq(projects.id, projectId));
  await enqueueRender(projectId);
  revalidatePath(`/projects/${projectId}`);
}

/** Swaps the soundtrack of an ambient video; a finished video is rendered again with it. */
export async function replaceSoundtrack(projectId: string, audioPath: string) {
  const key = z.string().regex(SOUNDTRACK_KEY).parse(audioPath);
  const audioSeconds = await mediaDuration(resolveKey(key));
  const [row] = await db
    .update(projects)
    .set({ audioPath: key, audioSeconds })
    .where(eq(projects.id, projectId))
    .returning({ status: projects.status });
  if (row?.status === "done") {
    await db.update(projects).set({ status: "rendering", error: null }).where(eq(projects.id, projectId));
    await enqueueRender(projectId);
  }
  revalidatePath(`/projects/${projectId}`);
}

/**
 * Sets or clears the place reference photo. Only images drawn from now on use it; redraw a
 * scene's image to apply it there.
 */
export async function setReferenceImage(projectId: string, key: string | null) {
  const referenceImagePath = key === null ? null : z.string().regex(REFERENCE_KEY).parse(key);
  await db.update(projects).set({ referenceImagePath }).where(eq(projects.id, projectId));
  revalidatePath(`/projects/${projectId}`);
}

/** Writes the platform captions again, e.g. when the first ones missed the mark. */
export async function regeneratePosts(projectId: string) {
  const rows = await db
    .update(projects)
    .set({ postsStatus: "writing", postsError: null })
    .where(and(eq(projects.id, projectId), eq(projects.status, "done")))
    .returning({ id: projects.id });
  if (rows.length === 0) return;
  await enqueuePosts(projectId);
  revalidatePath(`/projects/${projectId}`);
}

const thumbnailInputSchema = z.object({
  text: z.string().trim().min(1).max(80),
  prompt: z.string().trim().min(1),
  background: z.enum(["ai", "scene"]),
  scene: z.coerce.number().int().min(1),
});

export type ThumbnailInput = z.infer<typeof thumbnailInputSchema>;

/**
 * Saves the thumbnail settings and redraws it. The background is only regenerated when it has
 * to be (`newImage`, or a different background source, scene or prompt); a headline edit
 * just re-lays the text.
 */
export async function updateThumbnail(projectId: string, input: ThumbnailInput, opts: { newImage: boolean }) {
  const fields = thumbnailInputSchema.parse(input);
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    columns: { thumbnail: true },
  });
  if (!project?.thumbnail) return;
  const old = project.thumbnail;
  const sameBackground =
    !opts.newImage &&
    fields.background === old.background &&
    (fields.background === "scene" ? fields.scene === old.scene : fields.prompt === old.prompt);
  await db
    .update(projects)
    .set({
      thumbnail: { ...old, ...fields, basePath: sameBackground ? old.basePath : null },
      thumbnailStatus: "drawing",
      thumbnailError: null,
    })
    .where(eq(projects.id, projectId));
  await enqueueThumbnail(projectId);
  revalidatePath(`/projects/${projectId}`);
}

/** Asks the AI to pick the best moments of a finished video again and cuts new Shorts. */
export async function cutShorts(projectId: string) {
  const rows = await db
    .update(projects)
    .set({ shortsStatus: "writing", shortsError: null })
    .where(and(eq(projects.id, projectId), eq(projects.status, "done")))
    .returning({ id: projects.id });
  if (rows.length === 0) return;
  await enqueueShortsPlan(projectId);
  revalidatePath(`/projects/${projectId}`);
}

const shortInputSchema = z
  .object({
    hook: z.string().trim().min(1).max(80),
    title: z.string().trim().min(1).max(100),
    description: z.string().trim().max(5000).default(""),
    fromScene: z.coerce.number().int().min(0),
    toScene: z.coerce.number().int().min(0),
  })
  .refine((v) => v.toScene >= v.fromScene, { message: "The last scene comes before the first one" });

export type ShortInput = z.input<typeof shortInputSchema>;

/**
 * Saves a Short's hook, scenes and captions. The clip is cut again only when what is on screen
 * changed (hook or scenes); a new title or description is just saved.
 */
export async function updateShort(projectId: string, shortId: string, input: ShortInput) {
  const fields = shortInputSchema.parse(input);
  const short = await db.query.shorts.findFirst({
    where: and(eq(shorts.id, shortId), eq(shorts.projectId, projectId)),
    columns: { hook: true, fromScene: true, toScene: true, status: true },
  });
  if (!short) return;
  const recut =
    short.status === "failed" ||
    fields.hook !== short.hook ||
    fields.fromScene !== short.fromScene ||
    fields.toScene !== short.toScene;
  await db
    .update(shorts)
    .set({ ...fields, ...(recut ? { status: "rendering" as const, error: null } : {}) })
    .where(eq(shorts.id, shortId));
  if (recut) await enqueueShortRenders([shortId]);
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteProject(projectId: string) {
  await db.delete(projects).where(eq(projects.id, projectId));
  revalidatePath("/");
  redirect("/");
}

// -------------------------------------------------------------- language

export async function setLocale(locale: string) {
  if (!hasLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
