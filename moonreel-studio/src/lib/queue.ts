import { PgBoss } from "pg-boss";
import { env } from "@/lib/env";

export const QUEUES = {
  scriptGenerate: "script-generate",
  characterReference: "character-reference",
  sceneProduce: "scene-produce",
  projectRender: "project-render",
} as const;

export interface ScriptGenerateJob {
  projectId: string;
}
export interface CharacterReferenceJob {
  characterId: string;
}
export interface SceneProduceJob {
  sceneId: string;
}
export interface ProjectRenderJob {
  projectId: string;
}

const globalForBoss = globalThis as unknown as { boss?: Promise<PgBoss> };

async function createBoss() {
  const boss = new PgBoss(env().DATABASE_URL);
  boss.on("error", (err) => console.error("[pg-boss]", err));
  await boss.start();
  // Muse jobs are slow; give them room before pg-boss expires and retries them.
  await boss.createQueue(QUEUES.scriptGenerate, { retryLimit: 1, expireInSeconds: 15 * 60 });
  await boss.createQueue(QUEUES.characterReference, { retryLimit: 1, expireInSeconds: 15 * 60 });
  await boss.createQueue(QUEUES.sceneProduce, {
    retryLimit: 1,
    retryDelay: 30,
    expireInSeconds: 40 * 60,
  });
  // One queued render per project: duplicate sends while one is waiting are dropped.
  await boss.createQueue(QUEUES.projectRender, {
    policy: "short",
    retryLimit: 1,
    expireInSeconds: 20 * 60,
  });
  return boss;
}

export function getBoss() {
  globalForBoss.boss ??= createBoss().catch((err) => {
    globalForBoss.boss = undefined;
    throw err;
  });
  return globalForBoss.boss;
}

export async function enqueueScript(projectId: string) {
  const boss = await getBoss();
  await boss.send(QUEUES.scriptGenerate, { projectId } satisfies ScriptGenerateJob);
}

export async function enqueueCharacterReference(characterId: string) {
  const boss = await getBoss();
  await boss.send(QUEUES.characterReference, { characterId } satisfies CharacterReferenceJob);
}

/** Enqueues all scenes in one insert instead of one round trip per scene. */
export async function enqueueScenes(sceneIds: string[]) {
  if (sceneIds.length === 0) return;
  const boss = await getBoss();
  await boss.insert(
    QUEUES.sceneProduce,
    sceneIds.map((sceneId) => ({ data: { sceneId } satisfies SceneProduceJob })),
  );
}

export async function enqueueRender(projectId: string) {
  const boss = await getBoss();
  await boss.send(QUEUES.projectRender, { projectId } satisfies ProjectRenderJob, {
    singletonKey: projectId,
  });
}
