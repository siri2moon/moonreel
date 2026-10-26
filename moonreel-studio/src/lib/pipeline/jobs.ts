import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { characters, projects, scenes, type Character } from "@/db/schema";
import { getProvider } from "@/lib/providers";
import { MuseRefusedError } from "@/lib/providers/muse2api";
import { REFUSED_PREFIX } from "@/lib/scene-errors";
import { enqueueRender } from "@/lib/queue";
import { resolveKey, saveFile, toDataUrl } from "@/lib/storage";
import {
  buildCharacterReferencePrompt,
  buildKeyframePrompt,
  buildRepairPrompt,
  buildScriptPrompt,
  buildVideoPrompt,
  parseScript,
  type Script,
} from "./prompts";
import { renderFinal } from "./render";

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
      lastErr = err;
      console.warn(`[${label}] attempt ${i}/${attempts} failed: ${message(err)}`);
    }
  }
  throw lastErr;
}

async function characterRef(character: Character | null) {
  if (character?.referenceStatus !== "ready" || !character.referenceImagePath) return undefined;
  return toDataUrl(character.referenceImagePath);
}

export async function generateScript(projectId: string) {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    with: { niche: true, character: true },
  });
  if (!project) return;

  try {
    const provider = getProvider();
    const raw = await withRetry("script", () =>
      provider.chat(
        buildScriptPrompt({
          niche: project.niche,
          character: project.character,
          topic: project.topic,
          aspectRatio: project.aspectRatio,
        }),
      ),
    );

    let script: Script;
    try {
      script = parseScript(raw);
    } catch (err) {
      console.warn(`[script] unparseable reply for ${projectId}: ${message(err)}\n${raw.slice(0, 2000)}`);
      script = parseScript(await provider.chat(buildRepairPrompt(raw, message(err))));
    }

    await db.transaction(async (tx) => {
      await tx.delete(scenes).where(eq(scenes.projectId, projectId));
      await tx.insert(scenes).values(
        script.scenes.map((s, index) => ({
          projectId,
          index,
          narration: s.narration,
          visualPrompt: s.visualPrompt,
          camera: s.camera,
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

export async function produceScene(sceneId: string) {
  const scene = await db.query.scenes.findFirst({
    where: eq(scenes.id, sceneId),
    with: { project: { with: { niche: true, character: true } } },
  });
  // A job can be redelivered after a worker restart; never redo a finished scene.
  if (!scene || scene.status === "done" || scene.project.status !== "producing") return;

  const { project } = scene;
  const { niche, character } = project;
  const provider = getProvider();
  const prefix = `projects/${project.id}/scenes/${String(scene.index).padStart(2, "0")}`;

  try {
    let keyframePath = scene.keyframePath;
    if (!keyframePath) {
      await db.update(scenes).set({ status: "keyframe", error: null }).where(eq(scenes.id, sceneId));
      const reference = await characterRef(character);
      const image = await withRetry("keyframe", () =>
        provider.generateImage({
          prompt: buildKeyframePrompt({ scene, niche, character }),
          aspectRatio: project.aspectRatio,
          referenceImage: reference,
        }),
      );
      keyframePath = await saveFile(`${prefix}-keyframe${image.ext}`, image.data);
      await db.update(scenes).set({ keyframePath }).where(eq(scenes.id, sceneId));
    }

    await db.update(scenes).set({ status: "video", error: null }).where(eq(scenes.id, sceneId));
    const firstFrame = await toDataUrl(keyframePath);
    const video = await withRetry("video", () =>
      provider.generateVideo({
        prompt: buildVideoPrompt({ scene, niche, character }),
        aspectRatio: project.aspectRatio,
        durationSeconds: niche.sceneSeconds,
        firstFrame,
      }),
    );
    const clipPath = await saveFile(`${prefix}${video.ext}`, video.data);
    await db
      .update(scenes)
      .set({ clipPath, status: "done", error: null })
      .where(eq(scenes.id, sceneId));
  } catch (err) {
    await db
      .update(scenes)
      .set({
        status: "failed",
        error: err instanceof MuseRefusedError ? `${REFUSED_PREFIX}${err.reply}` : message(err),
      })
      .where(eq(scenes.id, sceneId));
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
    with: { scenes: { orderBy: [asc(scenes.index)] } },
  });
  if (!project || project.scenes.length === 0) return;
  if (project.scenes.some((s) => s.status !== "done" || !s.clipPath)) return;

  await db
    .update(projects)
    .set({ status: "rendering", error: null })
    .where(eq(projects.id, projectId));

  try {
    const finalKey = `projects/${projectId}/final.mp4`;
    const srtKey = `projects/${projectId}/captions.srt`;
    await renderFinal({
      clips: project.scenes.map((s) => ({ file: resolveKey(s.clipPath!), narration: s.narration })),
      aspectRatio: project.aspectRatio,
      outFile: resolveKey(finalKey),
      srtFile: resolveKey(srtKey),
    });
    await db
      .update(projects)
      .set({ status: "done", finalVideoPath: finalKey, captionsPath: srtKey })
      .where(eq(projects.id, projectId));
  } catch (err) {
    await db
      .update(projects)
      .set({ status: "failed", error: `Render failed: ${message(err)}` })
      .where(eq(projects.id, projectId));
  }
}
