import { env } from "@/lib/env";
import {
  generateCharacterReference,
  generateScript,
  produceScene,
  renderProject,
} from "@/lib/pipeline/jobs";
import {
  QUEUES,
  getBoss,
  type CharacterReferenceJob,
  type ProjectRenderJob,
  type SceneProduceJob,
  type ScriptGenerateJob,
} from "@/lib/queue";

async function main() {
  const boss = await getBoss();
  const museConcurrency = env().MUSE_CONCURRENCY;

  await boss.work<ScriptGenerateJob>(QUEUES.scriptGenerate, async ([job]) => {
    console.log(`[script] project ${job.data.projectId}`);
    await generateScript(job.data.projectId);
  });

  await boss.work<CharacterReferenceJob>(QUEUES.characterReference, async ([job]) => {
    console.log(`[character] ${job.data.characterId}`);
    await generateCharacterReference(job.data.characterId);
  });

  await boss.work<SceneProduceJob>(
    QUEUES.sceneProduce,
    { localConcurrency: museConcurrency },
    async ([job]) => {
      console.log(`[scene] ${job.data.sceneId}`);
      await produceScene(job.data.sceneId);
    },
  );

  await boss.work<ProjectRenderJob>(QUEUES.projectRender, async ([job]) => {
    console.log(`[render] project ${job.data.projectId}`);
    await renderProject(job.data.projectId);
  });

  console.log(`Worker ready (Muse concurrency ${museConcurrency})`);

  const shutdown = async () => {
    console.log("Stopping worker…");
    await boss.stop({ graceful: true });
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
