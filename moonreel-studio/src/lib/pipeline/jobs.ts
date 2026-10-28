import { and, asc, eq, ne, sql } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/db";
import {
  characters,
  projectCharacters,
  projects,
  scenes,
  shorts,
  type Character,
  type SocialPosts,
  type ThumbnailSpec,
} from "@/db/schema";
import { getProvider } from "@/lib/providers";
import { gatewayChat, gatewayConfigured } from "@/lib/providers/gateway";
import { MuseRefusedError } from "@/lib/providers/muse2api";
import { pauseScenes } from "@/lib/production";
import { AUTO_PAUSED_ERROR, BLOCKED_PREFIX, isRegionBlock, REFUSED_PREFIX } from "@/lib/scene-errors";
import { enqueuePosts, enqueueRender, enqueueScenes, enqueueShortRenders, enqueueThumbnail } from "@/lib/queue";
import { readFileByKey, resolveKey, saveFile, toDataUrl } from "@/lib/storage";
import type { z } from "zod";
import {
  buildAmbientScriptPrompt,
  buildCharacterReferencePrompt,
  buildKeyframePrompt,
  buildOutlinePrompt,
  buildPostsPrompt,
  buildRepairPrompt,
  buildScriptPartPrompt,
  buildScriptPrompt,
  buildShortsPrompt,
  buildThumbnailPrompt,
  buildVideoPrompt,
  MAX_CHARACTERS_PER_SCENE,
  outlineSchema,
  parseReply,
  POSTS_SHAPE,
  postsSchema,
  type PostsReply,
  SCRIPT_PART_SCENES,
  scenesSchema,
  scriptSchema,
  type Script,
  SHORTS_SHAPE,
  shortsPlanSchema,
  type ShortsPlan,
} from "./prompts";
import { cameraStillness, mediaDuration, renderFinal, renderLoop } from "./render";
import { captionCues, renderShort, SHORT_MAX_SECONDS, SHORT_MIN_SECONDS } from "./shorts";
import { composeThumbnail, THUMBNAIL_STYLES, type ThumbnailStyle } from "./thumbnail";
import { synthesizeNarration } from "./voiceover";

function message(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

/** Muse fails intermittently; one immediate retry recovers most of those. */
async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 2): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      // The account may not make videos at all; asking again only teaches Muse to stop trying.
      if (err instanceof MuseRefusedError && isRegionBlock(err.reply)) throw err;
      lastErr = err;
      console.warn(`[${label}] attempt ${i}/${attempts} failed: ${message(err)}`);
    }
  }
  throw lastErr;
}

/** Loads a project's cast, lead first, with every relational query that needs it. */
const withCast = {
  cast: { orderBy: [asc(projectCharacters.position)], with: { character: true as const } },
};

function castOf(project: { cast: { character: Character }[] }) {
  return project.cast.map((c) => c.character);
}

/**
 * Who is on screen in a shot. A single-character project shows its character everywhere, as
 * it always has; a larger cast shows the members the script picked for the shot.
 */
function sceneCharacters(scene: { characterIds: string[] }, cast: Character[]) {
  if (cast.length === 1) return cast;
  const byId = new Map(cast.map((c) => [c.id, c]));
  return scene.characterIds
    .map((id) => byId.get(id))
    .filter((c): c is Character => !!c)
    .slice(0, MAX_CHARACTERS_PER_SCENE);
}

const BOARD_TILE_PX = 768;
const BOARD_GAP_PX = 48;
const BOARD_BACKGROUND = { r: 232, g: 232, b: 232 };

/**
 * Muse takes one reference image, so several characters go in as one sheet: their reference
 * images side by side, left to right in `characters` order. `board` lists who made it in.
 */
async function castReference(characters: Character[]) {
  const ready = characters.filter((c) => c.referenceStatus === "ready" && c.referenceImagePath);
  if (ready.length === 0) return { image: undefined, board: [] };
  if (ready.length === 1) return { image: await toDataUrl(ready[0].referenceImagePath!), board: [ready[0].name] };
  // File reads and image resizes, not DB queries.
  const tiles = await Promise.all(
    ready.map(async (c) =>
      sharp(await readFileByKey(c.referenceImagePath!))
        .resize(BOARD_TILE_PX, BOARD_TILE_PX, { fit: "contain", background: BOARD_BACKGROUND })
        .toBuffer(),
    ),
  );
  const sheet = await sharp({
    create: {
      width: ready.length * BOARD_TILE_PX + (ready.length - 1) * BOARD_GAP_PX,
      height: BOARD_TILE_PX,
      channels: 3,
      background: BOARD_BACKGROUND,
    },
  })
    .composite(tiles.map((input, i) => ({ input, left: i * (BOARD_TILE_PX + BOARD_GAP_PX), top: 0 })))
    .jpeg({ quality: 90 })
    .toBuffer();
  return { image: `data:image/jpeg;base64,${sheet.toString("base64")}`, board: ready.map((c) => c.name) };
}

/**
 * The reference image for a keyframe or thumbnail. A photo of the place, when the project has
 * one, wins over the characters, who are then described in words only.
 */
async function imageReference(project: { referenceImagePath: string | null }, characters: Character[]) {
  if (project.referenceImagePath) return { image: await toDataUrl(project.referenceImagePath), board: [] };
  return castReference(characters);
}

/** Maps the script's character names to the cast's ids; a lone character is in every shot. */
function castIdsFor(names: string[], cast: Character[]) {
  if (cast.length === 1) return [cast[0].id];
  const ids = names
    .map((name) => {
      const n = name.trim().toLowerCase();
      return cast.find((c) => c.name.toLowerCase() === n) ?? cast.find((c) => n.includes(c.name.toLowerCase()));
    })
    .filter((c): c is Character => !!c)
    .map((c) => c.id);
  return [...new Set(ids)].slice(0, MAX_CHARACTERS_PER_SCENE);
}

/**
 * One chat turn that must come back as JSON matching `schema`. An unparseable reply gets one
 * repair turn; a reply that parses but fails `check` (e.g. too few scenes) counts as a failed
 * attempt, so withRetry asks again.
 */
async function chatJson<T>(
  label: string,
  prompt: string,
  schema: z.ZodType<T>,
  shape: string,
  check?: (value: T) => void,
) {
  // Scripts go through Cloudflare AI Gateway when it is configured; Muse then only makes media.
  const chat = gatewayConfigured() ? gatewayChat : (p: string) => getProvider().chat(p);
  return withRetry(label, async () => {
    const raw = await chat(prompt);
    let value: T;
    try {
      value = parseReply(raw, schema);
    } catch (err) {
      console.warn(`[${label}] unparseable reply: ${message(err)}\n${raw.slice(0, 2000)}`);
      value = parseReply(await chat(buildRepairPrompt(raw, message(err), shape)), schema);
    }
    check?.(value);
    return value;
  });
}

const SCENE_FIELDS = '{"narration": string, "visualPrompt": string, "camera": string, "characters": [string]}';
const SCRIPT_SHAPE = `{"title": string, "scenes": [${SCENE_FIELDS}]}`;
const SCENES_SHAPE = `{"scenes": [${SCENE_FIELDS}]}`;
const OUTLINE_SHAPE = '{"title": string, "beats": [string]}';

async function writeScript(input: Parameters<typeof buildScriptPrompt>[0]): Promise<Script> {
  // Ambient shots are short notes, so even a long shot list fits one reply.
  if (input.niche.format === "ambient") {
    return chatJson("script", buildAmbientScriptPrompt(input), scriptSchema, SCRIPT_SHAPE);
  }
  // Gateway models answer long scripts in one turn; Muse needs them in parts (see SCRIPT_PART_SCENES).
  if (gatewayConfigured() || input.niche.sceneCount <= SCRIPT_PART_SCENES) {
    return chatJson("script", buildScriptPrompt(input), scriptSchema, SCRIPT_SHAPE);
  }

  const outline = await chatJson("outline", buildOutlinePrompt(input), outlineSchema, OUTLINE_SHAPE);
  outline.beats = outline.beats.slice(0, input.niche.sceneCount);

  // Parts run one after another on purpose: each continues from the narration of the one
  // before it. These are Muse chat turns, not DB queries.
  const scenes: Script["scenes"] = [];
  for (let from = 1; from <= outline.beats.length; from += SCRIPT_PART_SCENES) {
    const to = Math.min(from + SCRIPT_PART_SCENES - 1, outline.beats.length);
    const expected = to - from + 1;
    const part = await chatJson(
      `script ${from}-${to}`,
      buildScriptPartPrompt({ ...input, outline, from, to, previous: scenes.slice(-3).map((s) => s.narration) }),
      scenesSchema,
      SCENES_SHAPE,
      (p) => {
        if (p.scenes.length < expected) throw new Error(`expected ${expected} scenes, got ${p.scenes.length}`);
      },
    );
    scenes.push(...part.scenes.slice(0, expected));
  }
  return { title: outline.title, scenes };
}

export async function generateScript(projectId: string) {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    with: { niche: true, ...withCast },
  });
  if (!project) return;
  const cast = castOf(project);

  try {
    const script = await writeScript({
      // A video may ask for more or fewer scenes than its niche; the prompts read it from here.
      niche: { ...project.niche, sceneCount: project.sceneCount ?? project.niche.sceneCount },
      cast,
      topic: project.topic,
      aspectRatio: project.aspectRatio,
      placeReference: !!project.referenceImagePath,
    });

    await db.transaction(async (tx) => {
      await tx.delete(scenes).where(eq(scenes.projectId, projectId));
      await tx.insert(scenes).values(
        script.scenes.map((s, index) => ({
          projectId,
          index,
          narration: s.narration,
          visualPrompt: s.visualPrompt,
          camera: s.camera,
          characterIds: castIdsFor(s.characters, cast),
        })),
      );
      await tx
        .update(projects)
        .set({ title: script.title, status: "script_ready", error: null })
        .where(eq(projects.id, projectId));
    });
  } catch (err) {
    await db
      .update(projects)
      .set({ status: "failed", error: `Script generation failed: ${message(err)}` })
      .where(eq(projects.id, projectId));
  }
}

export async function generateCharacterReference(characterId: string) {
  const character = await db.query.characters.findFirst({ where: eq(characters.id, characterId) });
  if (!character) return;

  try {
    const media = await withRetry("character", () =>
      getProvider().generateImage({
        prompt: buildCharacterReferencePrompt(character),
        aspectRatio: "9:16",
      }),
    );
    const key = await saveFile(`characters/${characterId}/reference${media.ext}`, media.data);
    await db
      .update(characters)
      .set({ referenceImagePath: key, referenceStatus: "ready", referenceError: null })
      .where(eq(characters.id, characterId));
  } catch (err) {
    await db
      .update(characters)
      .set({ referenceStatus: "failed", referenceError: message(err) })
      .where(eq(characters.id, characterId));
  }
}

// Ambient clips must hold a still camera. Below this first-to-later-frame SSIM the camera moved
// (still shots measure 0.84–0.9, zooms and pans 0.35–0.47), and the clip is made again.
const STILL_CAMERA_MIN_SSIM = 0.65;
const STILL_CAMERA_ATTEMPTS = 3;

// How long a fixed-camera shot waits before checking again for scene 1's keyframe.
const SHARED_KEYFRAME_WAIT_S = 30;

/**
 * Fixed-camera ambient niches draw one keyframe, in scene 1, and every other shot starts from
 * it. Returns that keyframe, or "wait" while scene 1 is still drawing it.
 */
async function sharedKeyframe(projectId: string): Promise<string | "wait"> {
  const first = await db.query.scenes.findFirst({
    where: and(eq(scenes.projectId, projectId), eq(scenes.index, 0)),
    columns: { keyframePath: true, status: true },
  });
  if (first?.keyframePath) return first.keyframePath;
  if (!first || first.status === "failed") throw new Error("Scene 1 has no image yet: retry scene 1 first");
  return "wait";
}

// This many clips failing in a row, with none made in between, means Muse cannot make videos
// right now (allowance used up, account blocked) rather than that one scene is a problem.
const CLIP_FAILURE_STREAK = 3;

/** True when the project's last few clips all failed at the video step. One aggregate query. */
async function clipsKeepFailing(projectId: string) {
  const [row] = await db
    .select({
      // Failed at the video step: the keyframe exists. Counted since the last clip that worked.
      streak: sql<number>`count(*) filter (where ${scenes.status} = 'failed' and ${scenes.keyframePath} is not null and ${scenes.error} not like '[paused%' and ${scenes.updatedAt} > coalesce((select max(s2.updated_at) from scenes s2 where s2.project_id = ${projectId} and s2.status = 'done'), 'epoch'))::int`,
    })
    .from(scenes)
    .where(eq(scenes.projectId, projectId));
  return (row?.streak ?? 0) >= CLIP_FAILURE_STREAK;
}

/** Moves a scene to its next step unless it was paused meanwhile; false when it was. */
async function advance(sceneId: string, status: "keyframe" | "video") {
  const rows = await db
    .update(scenes)
    .set({ status, error: null })
    .where(and(eq(scenes.id, sceneId), ne(scenes.status, "failed")))
    .returning({ id: scenes.id });
  return rows.length > 0;
}

export async function produceScene(sceneId: string) {
  const scene = await db.query.scenes.findFirst({
    where: eq(scenes.id, sceneId),
    with: { project: { with: { niche: true, ...withCast } } },
  });
  // A job can be redelivered after a worker restart; never redo a finished scene. A failed one
  // was paused (or already given up on): Retry sets it back to pending before queueing it.
  if (!scene || scene.status === "done" || scene.status === "failed" || scene.project.status !== "producing") {
    return;
  }

  const { project } = scene;
  const { niche } = project;
  const cast = castOf(project);
  const onScreen = sceneCharacters(scene, cast);
  const provider = getProvider();
  const prefix = `projects/${project.id}/scenes/${String(scene.index).padStart(2, "0")}`;

  try {
    let keyframePath = scene.keyframePath;
    if (!keyframePath && niche.format === "ambient" && niche.fixedCamera && scene.index > 0) {
      const shared = await sharedKeyframe(project.id);
      if (shared === "wait") {
        await enqueueScenes([sceneId], { startAfterSeconds: SHARED_KEYFRAME_WAIT_S });
        return;
      }
      keyframePath = shared;
      await db.update(scenes).set({ keyframePath }).where(eq(scenes.id, sceneId));
    }
    if (!keyframePath) {
      if (!(await advance(sceneId, "keyframe"))) return;
      const reference = await imageReference(project, onScreen);
      const image = await withRetry("keyframe", () =>
        provider.generateImage({
          prompt: buildKeyframePrompt({
            scene,
            niche,
            characters: onScreen,
            board: reference.board,
            placeReference: !!project.referenceImagePath,
          }),
          aspectRatio: project.aspectRatio,
          referenceImage: reference.image,
        }),
      );
      keyframePath = await saveFile(`${prefix}-keyframe${image.ext}`, image.data);
      await db.update(scenes).set({ keyframePath }).where(eq(scenes.id, sceneId));
    }

    // Paused while the keyframe was drawn: keep the image, make no clip.
    if (!(await advance(sceneId, "video"))) return;
    const firstFrame = await toDataUrl(keyframePath);
    const makeClip = async () => {
      const video = await withRetry("video", () =>
        provider.generateVideo({
          prompt: buildVideoPrompt({
            scene,
            niche,
            characters: onScreen,
            speaker: cast.length === 1 ? cast[0] : undefined,
          }),
          aspectRatio: project.aspectRatio,
          durationSeconds: niche.sceneSeconds,
          firstFrame,
        }),
      );
      return saveFile(`${prefix}${video.ext}`, video.data);
    };
    let clipPath = await makeClip();
    if (niche.format === "ambient") {
      // Sequential on purpose: each attempt is a new Muse clip, made only if the last one moved.
      // These are Muse calls and ffmpeg runs, not DB queries.
      for (let attempt = 1; ; attempt++) {
        const stillness = await cameraStillness(resolveKey(clipPath));
        if (stillness >= STILL_CAMERA_MIN_SSIM) break;
        if (attempt >= STILL_CAMERA_ATTEMPTS) {
          throw new Error(
            `The camera moved in all ${attempt} clips Muse made (stillness ${stillness.toFixed(2)}, need ${STILL_CAMERA_MIN_SSIM}). Redo the clip, or make the scene calmer.`,
          );
        }
        console.warn(`[scene ${scene.index + 1}] camera moved (stillness ${stillness.toFixed(2)}), making the clip again`);
        clipPath = await makeClip();
      }
    }
    await db
      .update(scenes)
      .set({ clipPath, status: "done", error: null })
      .where(eq(scenes.id, sceneId));
  } catch (err) {
    const blocked = err instanceof MuseRefusedError && isRegionBlock(err.reply);
    await db
      .update(scenes)
      .set({
        status: "failed",
        error:
          err instanceof MuseRefusedError
            ? `${blocked ? BLOCKED_PREFIX : REFUSED_PREFIX}${err.reply}`
            : message(err),
      })
      .where(eq(scenes.id, sceneId));
    if (blocked) {
      await pauseScenes(project.id);
    } else if (await clipsKeepFailing(project.id)) {
      console.warn(`[project ${project.id}] ${CLIP_FAILURE_STREAK} clips failed in a row; pausing production`);
      await pauseScenes(project.id, AUTO_PAUSED_ERROR);
    }
    return;
  }

  // One aggregate query decides whether this was the last scene.
  const [counts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      done: sql<number>`count(*) filter (where ${scenes.status} = 'done')::int`,
    })
    .from(scenes)
    .where(eq(scenes.projectId, project.id));
  if (counts && counts.total > 0 && counts.done === counts.total) {
    await enqueueRender(project.id);
  }
}

export async function renderProject(projectId: string) {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    with: { niche: true, scenes: { orderBy: [asc(scenes.index)] } },
  });
  if (!project || project.scenes.length === 0) return;
  if (project.scenes.some((s) => s.status !== "done" || !s.clipPath)) return;

  await db
    .update(projects)
    .set({ status: "rendering", error: null })
    .where(eq(projects.id, projectId));

  try {
    const finalKey = `projects/${projectId}/final.mp4`;
    let srtKey: string | null = null;
    if (project.niche.format === "ambient") {
      if (!project.audioPath) throw new Error("No soundtrack uploaded");
      await renderLoop({
        clips: project.scenes.map((s) => resolveKey(s.clipPath!)),
        audio: resolveKey(project.audioPath),
        aspectRatio: project.aspectRatio,
        outFile: resolveKey(finalKey),
      });
    } else {
      srtKey = `projects/${projectId}/captions.srt`;
      const voiceId = project.niche.narratorVoiceId;
      const voices = voiceId
        ? await synthesizeNarration(voiceId, project.scenes.map((s) => s.narration))
        : [];
      await renderFinal({
        clips: project.scenes.map((s, i) => ({
          file: resolveKey(s.clipPath!),
          narration: s.narration,
          voice: voices[i],
        })),
        aspectRatio: project.aspectRatio,
        outFile: resolveKey(finalKey),
        srtFile: resolveKey(srtKey),
      });
    }
    await db
      .update(projects)
      .set({
        status: "done",
        finalVideoPath: finalKey,
        captionsPath: srtKey,
        postsStatus: "writing",
        postsError: null,
      })
      .where(eq(projects.id, projectId));
  } catch (err) {
    await db
      .update(projects)
      .set({ status: "failed", error: `Render failed: ${message(err)}` })
      .where(eq(projects.id, projectId));
    return;
  }
  // Chapter times come from the rendered video, so captions are rewritten after every render.
  await enqueuePosts(projectId);
}

const SRT_START = /^(\d+):(\d\d):(\d\d),(\d{3}) -->/gm;
const SRT_END = /--> (\d+):(\d\d):(\d\d),(\d{3})/g;

function srtSeconds(m: RegExpMatchArray) {
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
}

/** Each scene's start and end in the final video, read from the .srt the render wrote (one cue per scene). */
async function sceneSpans(captionsPath: string | null, sceneCount: number, sceneSeconds: number) {
  const srt = captionsPath ? await readFileByKey(captionsPath).then(String, () => "") : "";
  const starts = [...srt.matchAll(SRT_START)].map(srtSeconds);
  const ends = [...srt.matchAll(SRT_END)].map(srtSeconds);
  if (starts.length === sceneCount && ends.length === sceneCount) {
    return starts.map((start, i) => ({ start, end: ends[i] }));
  }
  return Array.from({ length: sceneCount }, (_, i) => ({ start: i * sceneSeconds, end: (i + 1) * sceneSeconds }));
}

/** Scene start times and total length of the final video. */
async function sceneTimes(captionsPath: string | null, sceneCount: number, sceneSeconds: number) {
  const spans = await sceneSpans(captionsPath, sceneCount, sceneSeconds);
  return { starts: spans.map((s) => s.start), total: spans.at(-1)?.end ?? 0 };
}

// YouTube only shows chapters when the first starts at 0:00, there are at least 3 and each
// lasts at least 10 seconds.
const MIN_CHAPTERS = 3;
const MIN_CHAPTER_S = 10;
const YOUTUBE_TITLE_MAX_CHARS = 100;
const YOUTUBE_TAGS_MAX_CHARS = 500;

function toChapters(chapters: PostsReply["youtube"]["chapters"], starts: number[], total: number) {
  const timed = chapters
    .map((c) => ({ start: starts[Math.min(Math.max(c.scene, 1), starts.length) - 1], title: c.title.trim() }))
    .sort((a, b) => a.start - b.start);
  if (timed.length > 0) timed[0].start = 0;
  const kept: SocialPosts["youtube"]["chapters"] = [];
  for (const c of timed) {
    const prev = kept[kept.length - 1];
    if (prev && c.start - prev.start < MIN_CHAPTER_S) continue;
    if (total - c.start < MIN_CHAPTER_S) continue;
    kept.push({ start: Math.floor(c.start), title: c.title });
  }
  return kept.length >= MIN_CHAPTERS ? kept : [];
}

function toTags(tags: string[]) {
  const seen = new Set<string>();
  const kept: string[] = [];
  let length = 0;
  for (const raw of tags) {
    const tag = raw.replace(/^#/, "").trim();
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    // YouTube counts the separating commas too.
    const next = length + tag.length + (kept.length ? 1 : 0);
    if (next > YOUTUBE_TAGS_MAX_CHARS) break;
    seen.add(key);
    kept.push(tag);
    length = next;
  }
  return kept;
}

export async function generatePosts(projectId: string) {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    with: { niche: true, scenes: { orderBy: [asc(scenes.index)] } },
  });
  if (!project || project.scenes.length === 0) return;

  await db
    .update(projects)
    .set({ postsStatus: "writing", postsError: null })
    .where(eq(projects.id, projectId));

  try {
    const ambient = project.niche.format === "ambient";
    // An ambient video runs as long as its soundtrack and has no per-scene timeline.
    const { starts, total } =
      ambient && project.finalVideoPath
        ? { starts: [], total: await mediaDuration(resolveKey(project.finalVideoPath)) }
        : await sceneTimes(project.captionsPath, project.scenes.length, project.niche.sceneSeconds);
    const reply = await chatJson(
      "posts",
      buildPostsPrompt({
        niche: project.niche,
        title: project.title,
        topic: project.topic,
        aspectRatio: project.aspectRatio,
        durationSeconds: total,
        narration: project.scenes.map((s) => s.narration),
      }),
      postsSchema,
      POSTS_SHAPE,
      (r) => {
        if (r.youtube.title.length > YOUTUBE_TITLE_MAX_CHARS) {
          throw new Error(`YouTube title is ${r.youtube.title.length} characters`);
        }
      },
    );
    const posts: SocialPosts = {
      youtube: {
        title: reply.youtube.title.trim(),
        description: reply.youtube.description.trim(),
        tags: toTags(reply.youtube.tags),
        chapters:
          project.aspectRatio === "16:9" && !ambient ? toChapters(reply.youtube.chapters, starts, total) : [],
      },
      tiktok: { caption: reply.tiktok.caption.trim() },
      instagram: { caption: reply.instagram.caption.trim() },
      facebook: { caption: reply.facebook.caption.trim() },
    };
    // The thumbnail is drawn once; later caption rewrites keep it (and any edits to it).
    const firstThumbnail = !project.thumbnail;
    const thumbnail: ThumbnailSpec = project.thumbnail ?? {
      text: reply.thumbnail.text.trim(),
      prompt: reply.thumbnail.prompt.trim(),
      background: "ai",
      scene: Math.min(Math.max(reply.thumbnail.scene, 1), project.scenes.length),
      basePath: null,
      path: null,
      note: null,
    };
    await db
      .update(projects)
      .set({
        posts,
        postsStatus: "ready",
        postsError: null,
        thumbnail,
        ...(firstThumbnail ? { thumbnailStatus: "drawing" as const, thumbnailError: null } : {}),
      })
      .where(eq(projects.id, projectId));
    if (firstThumbnail) await enqueueThumbnail(projectId);
  } catch (err) {
    await db
      .update(projects)
      .set({ postsStatus: "failed", postsError: message(err) })
      .where(eq(projects.id, projectId));
  }
}

function thumbnailStyle(value: string): ThumbnailStyle {
  return (THUMBNAIL_STYLES as readonly string[]).includes(value) ? (value as ThumbnailStyle) : "impact";
}

/**
 * Draws the background (a dedicated Muse image, or a scene keyframe) when there is none yet,
 * then lays the niche's template over it. Editing only the headline reuses the background.
 */
export async function generateThumbnail(projectId: string) {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    with: { niche: true, ...withCast, scenes: { orderBy: [asc(scenes.index)] } },
  });
  if (!project?.thumbnail) return;
  const { niche } = project;
  const featured = castOf(project).slice(0, MAX_CHARACTERS_PER_SCENE);
  const spec = { ...project.thumbnail };

  await db
    .update(projects)
    .set({ thumbnailStatus: "drawing", thumbnailError: null })
    .where(eq(projects.id, projectId));

  try {
    const keyframeOf = (scene: number) =>
      project.scenes[scene - 1]?.keyframePath ?? project.scenes.find((s) => s.keyframePath)?.keyframePath;

    if (!spec.basePath) {
      spec.note = null;
      if (spec.background === "scene") {
        spec.basePath = keyframeOf(spec.scene) ?? null;
      } else {
        try {
          const reference = await imageReference(project, featured);
          const image = await withRetry("thumbnail", () =>
            getProvider().generateImage({
              prompt: buildThumbnailPrompt({
                niche,
                cast: featured,
                board: reference.board,
                prompt: spec.prompt,
                aspectRatio: project.aspectRatio,
                placeReference: !!project.referenceImagePath,
              }),
              aspectRatio: project.aspectRatio,
              referenceImage: reference.image,
            }),
          );
          spec.basePath = await saveFile(`projects/${projectId}/thumbnail-base${image.ext}`, image.data);
        } catch (err) {
          // Muse sometimes declines dramatic prompts; a keyframe still makes a good thumbnail.
          const fallback = keyframeOf(spec.scene);
          if (!fallback) throw err;
          spec.basePath = fallback;
          spec.note = err instanceof MuseRefusedError ? err.reply : message(err);
        }
      }
      if (!spec.basePath) throw new Error("No image to build the thumbnail from");
    }

    const jpeg = await composeThumbnail({
      base: await readFileByKey(spec.basePath),
      headline: spec.text,
      style: thumbnailStyle(niche.thumbnailStyle),
      accent: niche.thumbnailAccent,
      brand: niche.thumbnailBrand,
      aspectRatio: project.aspectRatio,
    });
    spec.path = await saveFile(`projects/${projectId}/thumbnail.jpg`, jpeg);
    await db
      .update(projects)
      .set({ thumbnail: spec, thumbnailStatus: "ready", thumbnailError: null })
      .where(eq(projects.id, projectId));
  } catch (err) {
    await db
      .update(projects)
      .set({ thumbnail: spec, thumbnailStatus: "failed", thumbnailError: message(err) })
      .where(eq(projects.id, projectId));
  }
}

const SHORTS_PER_VIDEO = 3;

/**
 * Turns the planner's picks into valid scene runs: 0-based, inside the video, no longer than a
 * Short may be (trimmed from the end), not overlapping an earlier pick.
 */
function normalizeShorts(plan: ShortsPlan["shorts"], spans: { start: number; end: number }[]) {
  const last = spans.length - 1;
  const kept: (ShortsPlan["shorts"][number] & { from: number; to: number })[] = [];
  for (const pick of plan) {
    const from = Math.min(Math.max(pick.fromScene - 1, 0), last);
    let to = Math.min(Math.max(pick.toScene - 1, from), last);
    while (to > from && spans[to].end - spans[from].start > SHORT_MAX_SECONDS) to--;
    if (kept.some((k) => from <= k.to && to >= k.from)) continue;
    kept.push({ ...pick, from, to });
    if (kept.length === SHORTS_PER_VIDEO) break;
  }
  return kept;
}

/** Picks the best moments of a finished video and queues one vertical Short for each. */
export async function planShorts(projectId: string) {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    with: { niche: true, scenes: { orderBy: [asc(scenes.index)] } },
  });
  if (!project || project.status !== "done" || !project.finalVideoPath) return;

  try {
    const spans = await sceneSpans(project.captionsPath, project.scenes.length, project.niche.sceneSeconds);
    const plan = await chatJson(
      "shorts",
      buildShortsPrompt({
        niche: project.niche,
        title: project.posts?.youtube.title ?? project.title,
        topic: project.topic,
        scenes: project.scenes.map((s, i) => ({
          narration: s.narration,
          start: spans[i].start,
          seconds: spans[i].end - spans[i].start,
        })),
        count: SHORTS_PER_VIDEO,
        minSeconds: SHORT_MIN_SECONDS,
        maxSeconds: SHORT_MAX_SECONDS,
      }),
      shortsPlanSchema,
      SHORTS_SHAPE,
      (p) => {
        if (normalizeShorts(p.shorts, spans).length === 0) throw new Error("no usable Short in the plan");
      },
    );
    const picks = normalizeShorts(plan.shorts, spans);
    const inserted = await db.transaction(async (tx) => {
      await tx.delete(shorts).where(eq(shorts.projectId, projectId));
      const rows = await tx
        .insert(shorts)
        .values(
          picks.map((p, index) => ({
            projectId,
            index,
            fromScene: p.from,
            toScene: p.to,
            hook: p.hook.trim(),
            title: p.title.trim(),
            description: p.description.trim(),
          })),
        )
        .returning({ id: shorts.id });
      await tx
        .update(projects)
        .set({ shortsStatus: "ready", shortsError: null })
        .where(eq(projects.id, projectId));
      return rows;
    });
    await enqueueShortRenders(inserted.map((r) => r.id));
  } catch (err) {
    await db
      .update(projects)
      .set({ shortsStatus: "failed", shortsError: message(err) })
      .where(eq(projects.id, projectId));
  }
}

/** Cuts one Short out of the final video with its hook and burned-in captions. */
export async function renderShortClip(shortId: string) {
  const short = await db.query.shorts.findFirst({
    where: eq(shorts.id, shortId),
    with: { project: { with: { niche: true, scenes: { orderBy: [asc(scenes.index)] } } } },
  });
  if (!short) return;
  const { project } = short;

  await db.update(shorts).set({ status: "rendering", error: null }).where(eq(shorts.id, shortId));
  try {
    if (!project.finalVideoPath) throw new Error("The video has not been rendered yet");
    const spans = await sceneSpans(project.captionsPath, project.scenes.length, project.niche.sceneSeconds);
    const from = Math.min(short.fromScene, spans.length - 1);
    const to = Math.min(Math.max(short.toScene, from), spans.length - 1);
    const start = spans[from].start;
    const seconds = spans[to].end - start;
    const key = `projects/${project.id}/shorts/short-${short.index + 1}.mp4`;
    await renderShort({
      source: resolveKey(project.finalVideoPath),
      sourceAspect: project.aspectRatio,
      start,
      seconds,
      hook: short.hook,
      captions: captionCues(
        project.scenes.slice(from, to + 1).map((s, i) => ({ narration: s.narration, ...spans[from + i] })),
        start,
      ),
      accent: project.niche.thumbnailAccent,
      brand: project.niche.thumbnailBrand,
      outFile: resolveKey(key),
    });
    await db
      .update(shorts)
      .set({ status: "ready", videoPath: key, error: null })
      .where(eq(shorts.id, shortId));
  } catch (err) {
    await db
      .update(shorts)
      .set({ status: "failed", error: message(err) })
      .where(eq(shorts.id, shortId));
  }
}
