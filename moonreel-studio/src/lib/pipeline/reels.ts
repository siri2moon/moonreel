import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects, shorts, type ReelPost } from "@/db/schema";
import { publishReel, REEL_MAX_SECONDS, REEL_MIN_SECONDS, setReelCover } from "@/lib/providers/facebook";
import { IG_REEL_MAX_SECONDS, IG_REEL_MIN_SECONDS, publishInstagramReel } from "@/lib/providers/instagram";
import type { ReelPostJob } from "@/lib/queue";
import { readFileByKey, resolveKey } from "@/lib/storage";
import { probe } from "./render";

function message(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

const reelColumns = { facebookReel: true, instagramReel: true } as const;
const pageColumns = { niche: { columns: {}, with: { facebookPage: true } } } as const;

/** The file, Page and reels behind a job, in one relational query. */
async function loadTarget({ kind, id }: ReelPostJob) {
  if (kind === "project") {
    const row = await db.query.projects.findFirst({
      where: eq(projects.id, id),
      columns: { finalVideoPath: true, aspectRatio: true, thumbnail: true, thumbnailStatus: true, ...reelColumns },
      with: pageColumns,
    });
    return (
      row && {
        file: row.finalVideoPath,
        vertical: row.aspectRatio === "9:16",
        // The video's own thumbnail (drawn 9:16 for a vertical video) becomes the reel's cover.
        cover: row.thumbnailStatus === "ready" ? (row.thumbnail?.path ?? null) : null,
        row,
        page: row.niche.facebookPage,
      }
    );
  }
  const row = await db.query.shorts.findFirst({
    where: eq(shorts.id, id),
    columns: { videoPath: true, ...reelColumns },
    with: { project: { columns: {}, with: pageColumns } },
  });
  // Shorts are always cut 9:16.
  // A Short has no thumbnail of its own: Facebook picks a frame, which shows the burned-in hook.
  return row && { file: row.videoPath, vertical: true, cover: null, row, page: row.project.niche.facebookPage };
}

async function saveReel({ platform, kind, id }: ReelPostJob, reel: ReelPost) {
  const set = platform === "facebook" ? { facebookReel: reel } : { instagramReel: reel };
  if (kind === "project") {
    await db.update(projects).set(set).where(eq(projects.id, id));
  } else {
    await db.update(shorts).set(set).where(eq(shorts.id, id));
  }
}

const LIMITS = {
  facebook: { name: "Facebook", min: REEL_MIN_SECONDS, max: REEL_MAX_SECONDS },
  instagram: { name: "Instagram", min: IG_REEL_MIN_SECONDS, max: IG_REEL_MAX_SECONDS },
};

/**
 * Uploads a vertical video or a Short to the niche's Facebook Page or its linked Instagram
 * account as a reel. Facebook schedules the reel itself; an Instagram job runs at its time.
 */
export async function postReel(job: ReelPostJob) {
  const target = await loadTarget(job);
  let reel = target && (job.platform === "facebook" ? target.row.facebookReel : target.row.instagramReel);
  // Only the reel this job was queued for is posted: a redelivered job, or one whose reel was
  // since cancelled, rescheduled or already started, does nothing.
  if (!target || !reel || reel.videoId || reel.publishAt !== job.publishAt) return;
  if (reel.status !== "uploading" && reel.status !== "scheduled") return;

  try {
    const limits = LIMITS[job.platform];
    if (!target.page) throw new Error("This niche has no Facebook Page connected.");
    if (!target.file) throw new Error("The video has not been rendered yet.");
    if (!target.vertical) throw new Error(`${limits.name} reels must be vertical (9:16).`);
    const file = resolveKey(target.file);
    const { duration } = await probe(file);
    if (duration < limits.min || duration > limits.max) {
      throw new Error(`${limits.name} reels last ${limits.min}–${limits.max} s; this video is ${Math.round(duration)} s.`);
    }
    // Saved before the upload, so a retry can never post the same reel a second time.
    const onId = async (videoId: string) => {
      reel = { ...reel!, status: "uploading", videoId };
      await saveReel(job, reel);
    };

    if (job.platform === "facebook") {
      if (reel.publishAt && new Date(reel.publishAt).getTime() < Date.now() + 60_000) {
        throw new Error("The scheduled time has passed while the reel was waiting. Pick a new time.");
      }
      const videoId = await publishReel({
        pageId: target.page.id,
        accessToken: target.page.accessToken,
        file,
        caption: reel.caption,
        publishAt: reel.publishAt ? new Date(reel.publishAt) : undefined,
        onVideoId: onId,
      });
      // The reel is up either way; a cover that cannot be set is reported, not fatal.
      let note: string | null = null;
      if (target.cover) {
        try {
          await setReelCover(videoId, target.page.accessToken, await readFileByKey(target.cover));
        } catch (err) {
          note = `Cover image not set: ${message(err)}`;
        }
      }
      await saveReel(job, { ...reel, status: reel.publishAt ? "scheduled" : "published", error: null, note });
    } else {
      if (!target.page.instagramId) {
        throw new Error("No Instagram account is linked to this niche's Facebook Page. Reconnect the Page in the niche settings.");
      }
      await publishInstagramReel({
        instagramId: target.page.instagramId,
        accessToken: target.page.accessToken,
        file,
        caption: reel.caption,
        onContainerId: onId,
      });
      await saveReel(job, { ...reel, status: "published", error: null });
    }
  } catch (err) {
    console.warn(`[reel] ${job.platform} ${job.kind} ${job.id}: ${message(err)}`);
    await saveReel(job, { ...reel, status: "failed", error: message(err) });
  }
}
