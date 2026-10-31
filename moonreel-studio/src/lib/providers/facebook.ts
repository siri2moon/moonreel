import { readFile, stat } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

// Reels Publishing API: https://developers.facebook.com/docs/video-api/guides/reels-publishing
export const GRAPH_VERSION = "v26.0";
export const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const RUPLOAD = `https://rupload.facebook.com/video-upload/${GRAPH_VERSION}`;

/** Facebook accepts reels of 3 to 90 seconds. */
export const REEL_MIN_SECONDS = 3;
export const REEL_MAX_SECONDS = 90;
/** A scheduled reel must go public at least 10 minutes and at most 29 days from now. */
export const REEL_SCHEDULE_MIN_MS = 10 * 60 * 1000;
export const REEL_SCHEDULE_MAX_MS = 29 * 24 * 60 * 60 * 1000;

const STATUS_POLL_MS = 10_000;
const STATUS_DEADLINE_MS = 5 * 60 * 1000;

export class FacebookError extends Error {}

type GraphError = { error?: { message?: string; code?: number; error_subcode?: number } };

/** Parses a Graph API reply, turning its error object into a FacebookError. */
export async function graph<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & GraphError;
  if (!res.ok || body.error) {
    const e = body.error;
    throw new FacebookError(`Facebook ${res.status}: ${e?.message ?? "request failed"}${e?.code ? ` (code ${e.code})` : ""}`);
  }
  return body;
}

/** The Page a token belongs to, which also proves the token works for that Page. */
export async function fetchPage(pageId: string, accessToken: string) {
  const res = await fetch(
    `${GRAPH}/${encodeURIComponent(pageId)}?fields=id,name&access_token=${encodeURIComponent(accessToken)}`,
    { signal: AbortSignal.timeout(30_000) },
  );
  return graph<{ id: string; name: string }>(res);
}

/**
 * Sets a reel's cover image. Needs a Page token with pages_read_user_content and
 * pages_manage_engagement on top of the publishing permissions.
 */
export async function setReelCover(videoId: string, accessToken: string, jpeg: Buffer) {
  const form = new FormData();
  form.set("access_token", accessToken);
  form.set("is_preferred", "true");
  form.set("source", new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }), "cover.jpg");
  await graph<{ success?: boolean }>(
    await fetch(`${GRAPH}/${encodeURIComponent(videoId)}/thumbnails`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(60_000),
    }),
  );
}

type ReelStatus = {
  status?: {
    video_status?: string;
    uploading_phase?: { status?: string };
    processing_phase?: { status?: string; errors?: { message?: string }[] };
    publishing_phase?: { status?: string; errors?: { message?: string }[] };
  };
};

/**
 * Uploads a local MP4 as a reel on the Page and publishes or schedules it. Facebook keeps
 * processing after the finish call, so this waits for processing and reports its error, if any.
 */
export async function publishReel(input: {
  pageId: string;
  accessToken: string;
  file: string;
  caption: string;
  /** Goes public at this time; omitted, it goes public now. */
  publishAt?: Date;
  /** Called as soon as Facebook hands out the reel's id, before the upload. */
  onVideoId?: (videoId: string) => Promise<void>;
}) {
  const { pageId, accessToken } = input;
  const page = encodeURIComponent(pageId);

  const started = await graph<{ video_id: string }>(
    await fetch(`${GRAPH}/${page}/video_reels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ upload_phase: "start", access_token: accessToken }),
      signal: AbortSignal.timeout(60_000),
    }),
  );
  const videoId = started.video_id;
  await input.onVideoId?.(videoId);

  const { size } = await stat(input.file);
  await graph<{ success: boolean }>(
    await fetch(`${RUPLOAD}/${encodeURIComponent(videoId)}`, {
      method: "POST",
      headers: { Authorization: `OAuth ${accessToken}`, offset: "0", file_size: String(size) },
      body: new Uint8Array(await readFile(input.file)),
      signal: AbortSignal.timeout(15 * 60_000),
    }),
  );

  await graph<{ success: boolean }>(
    await fetch(`${GRAPH}/${page}/video_reels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: accessToken,
        video_id: videoId,
        upload_phase: "finish",
        video_state: input.publishAt ? "SCHEDULED" : "PUBLISHED",
        ...(input.publishAt ? { scheduled_publish_time: Math.floor(input.publishAt.getTime() / 1000) } : {}),
        description: input.caption,
        // MoonReel videos are made with Muse; Meta asks for AI-made media to be labelled.
        is_ai_generated: true,
      }),
      signal: AbortSignal.timeout(60_000),
    }),
  );

  // Polled one request at a time: each check waits on Facebook's processing, not on the DB.
  const deadline = Date.now() + STATUS_DEADLINE_MS;
  while (Date.now() < deadline) {
    const { status } = await graph<ReelStatus>(
      await fetch(`${GRAPH}/${encodeURIComponent(videoId)}?fields=status&access_token=${encodeURIComponent(accessToken)}`, {
        signal: AbortSignal.timeout(30_000),
      }),
    );
    const failed = [status?.processing_phase, status?.publishing_phase].find((p) => p?.status === "error");
    if (failed || status?.video_status === "error") {
      throw new FacebookError(`Facebook could not process the reel: ${failed?.errors?.[0]?.message ?? "unknown error"}`);
    }
    if (status?.processing_phase?.status === "complete") break;
    await sleep(STATUS_POLL_MS);
  }
  return videoId;
}
