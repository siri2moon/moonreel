import { readFile, stat } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { FacebookError, GRAPH, GRAPH_VERSION, graph } from "./facebook";

// Instagram API with Facebook Login, resumable upload:
// https://developers.facebook.com/docs/instagram-platform/content-publishing/
const RUPLOAD = `https://rupload.facebook.com/ig-api-upload/${GRAPH_VERSION}`;

/** Instagram takes reels of 3 seconds to 15 minutes; MoonReel's are far shorter. */
export const IG_REEL_MIN_SECONDS = 3;
export const IG_REEL_MAX_SECONDS = 15 * 60;

const STATUS_POLL_MS = 10_000;
const STATUS_DEADLINE_MS = 10 * 60 * 1000;

/**
 * The Instagram professional account linked to a Facebook Page, or null when there is none.
 * The Page access token needs instagram_basic for the account to show up here.
 */
export async function fetchInstagramAccount(pageId: string, accessToken: string) {
  const res = await fetch(
    `${GRAPH}/${encodeURIComponent(pageId)}?fields=instagram_business_account{id,username}&access_token=${encodeURIComponent(accessToken)}`,
    { signal: AbortSignal.timeout(30_000) },
  );
  const body = await graph<{ instagram_business_account?: { id: string; username?: string } }>(res);
  const account = body.instagram_business_account;
  return account ? { id: account.id, username: account.username ?? null } : null;
}

/**
 * Uploads a local MP4 to Instagram as a reel and publishes it right away. Instagram has no
 * scheduled publishing in the API, so the caller runs this at the time the reel should go public.
 */
export async function publishInstagramReel(input: {
  instagramId: string;
  accessToken: string;
  file: string;
  caption: string;
  /** Called as soon as Instagram hands out the media container's id, before the upload. */
  onContainerId?: (containerId: string) => Promise<void>;
}) {
  const auth = { Authorization: `OAuth ${input.accessToken}` };

  const container = await graph<{ id: string }>(
    await fetch(`${GRAPH}/${encodeURIComponent(input.instagramId)}/media`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        media_type: "REELS",
        upload_type: "resumable",
        caption: input.caption,
        share_to_feed: true,
        // MoonReel videos are made with Muse; Meta asks for AI-made media to be labelled.
        is_ai_generated: true,
      }),
      signal: AbortSignal.timeout(60_000),
    }),
  );
  const containerId = container.id;
  await input.onContainerId?.(containerId);

  const { size } = await stat(input.file);
  await graph<{ success?: boolean }>(
    await fetch(`${RUPLOAD}/${encodeURIComponent(containerId)}`, {
      method: "POST",
      headers: { ...auth, offset: "0", file_size: String(size) },
      body: new Uint8Array(await readFile(input.file)),
      signal: AbortSignal.timeout(15 * 60_000),
    }),
  );

  // Instagram processes the video before it can be published. Checked one request at a time:
  // each check waits on Instagram, not on the DB.
  const deadline = Date.now() + STATUS_DEADLINE_MS;
  for (;;) {
    const { status_code, status } = await graph<{ status_code?: string; status?: string }>(
      await fetch(`${GRAPH}/${encodeURIComponent(containerId)}?fields=status_code,status`, {
        headers: auth,
        signal: AbortSignal.timeout(30_000),
      }),
    );
    if (status_code === "FINISHED") break;
    if (status_code === "ERROR" || status_code === "EXPIRED") {
      throw new FacebookError(`Instagram could not process the reel: ${status ?? status_code}`);
    }
    if (Date.now() > deadline) throw new FacebookError("Instagram is still processing the reel after 10 minutes.");
    await sleep(STATUS_POLL_MS);
  }

  const published = await graph<{ id: string }>(
    await fetch(`${GRAPH}/${encodeURIComponent(input.instagramId)}/media_publish`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: containerId }),
      signal: AbortSignal.timeout(60_000),
    }),
  );
  return published.id;
}
