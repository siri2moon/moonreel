import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { scenes } from "@/db/schema";
import { cancelSceneJobs } from "@/lib/queue";
import { PAUSED_ERROR } from "@/lib/scene-errors";

/**
 * Stops a project's production: scenes that have not reached the video step are marked paused
 * (with `reason`) and their waiting jobs cancelled. Clips already being made finish; Retry
 * continues the rest. Returns how many scenes were stopped.
 */
export async function pauseScenes(projectId: string, reason: string = PAUSED_ERROR) {
  const stopped = await db
    .update(scenes)
    .set({ status: "failed", error: reason })
    .where(and(eq(scenes.projectId, projectId), inArray(scenes.status, ["pending", "keyframe"])))
    .returning({ id: scenes.id });
  await cancelSceneJobs(stopped.map((s) => s.id));
  return stopped.length;
}
