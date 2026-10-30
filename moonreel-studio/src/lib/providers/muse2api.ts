import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { env } from "@/lib/env";
import { isRegionBlock } from "@/lib/scene-errors";
import type {
  GeneratedMedia,
  GenerationProvider,
  ImageRequest,
  VideoRequest,
} from "./types";

const POLL_INTERVAL_MS = 5_000;
const IMAGE_DEADLINE_MS = 8 * 60_000;
const VIDEO_DEADLINE_MS = 20 * 60_000;
// Stay under undici's default 300s headers timeout for non-streaming chat.
const CHAT_TIMEOUT_S = 280;

interface TaskResponse {
  task_id?: string;
  id?: string;
  status?: string;
  error?: string;
  url?: string;
  data?: { url?: string }[];
  video?: { url?: string };
}

export class MuseError extends Error {}

/** Muse replied with text ("sorry, I couldn't make this") instead of media; retrying the same prompt rarely helps. */
export class MuseRefusedError extends MuseError {
  constructor(readonly reply: string) {
    super(`Muse declined to generate media: ${reply}`);
  }
}

// muse2api reports a text-only answer as "模型未生成媒体，仅返回文本: <reply>" ("no media, text only").
const TEXT_ONLY_MARKER = "仅返回文本";

/**
 * Talks to a self-hosted muse2api instance (https://github.com/bynne2602/muse2api),
 * which drives the muse.ai web app with your own account cookies.
 */
export class Muse2ApiProvider implements GenerationProvider {
  readonly name = "muse2api";

  private get base() {
    return env().MUSE2API_BASE_URL.replace(/\/+$/, "");
  }

  private async request<T>(method: string, pathname: string, body?: unknown, timeoutMs = 60_000) {
    const res = await fetch(`${this.base}${pathname}`, {
      method,
      headers: {
        Authorization: `Bearer ${env().MUSE2API_KEY}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new MuseError(`muse2api ${method} ${pathname} → ${res.status}: ${text.slice(0, 500)}`);
    }
    return JSON.parse(text) as T;
  }

  async chat(prompt: string) {
    const res = await this.request<{ choices: { message: { content: string | null } }[] }>(
      "POST",
      "/v1/chat/completions",
      {
        model: "muse-spark",
        messages: [{ role: "user", content: prompt }],
        timeout: CHAT_TIMEOUT_S,
      },
      (CHAT_TIMEOUT_S + 15) * 1000,
    );
    const content = res.choices?.[0]?.message?.content;
    if (!content) throw new MuseError("Muse returned an empty chat response");
    return content;
  }

  async generateImage(req: ImageRequest) {
    const created = await this.request<TaskResponse>("POST", "/v1/images/tasks", {
      prompt: req.prompt,
      aspect_ratio: req.aspectRatio,
      reference_image: req.referenceImage,
    });
    const done = await this.waitForTask(`/v1/images/tasks/${taskId(created)}`, IMAGE_DEADLINE_MS);
    return this.download(done.data?.[0]?.url ?? done.url, ".png");
  }

  async generateVideo(req: VideoRequest) {
    const created = await this.request<TaskResponse>("POST", "/v1/videos", {
      prompt: req.prompt,
      aspect_ratio: req.aspectRatio,
      duration: req.durationSeconds,
      reference_image: req.firstFrame,
    });
    const done = await this.waitForTask(`/v1/videos/${taskId(created)}`, VIDEO_DEADLINE_MS);
    return this.download(done.video?.url ?? done.url, ".mp4");
  }

  async health() {
    const res = await fetch(`${this.base}/readyz`, { signal: AbortSignal.timeout(5_000) });
    return (await res.json()) as { status: string; accounts: number; browser_running: boolean };
  }

  private async waitForTask(pathname: string, deadlineMs: number) {
    const deadline = Date.now() + deadlineMs;
    while (Date.now() < deadline) {
      const task = await this.request<TaskResponse>("GET", pathname);
      if (task.status === "completed") return task;
      if (task.status === "failed") {
        const reason = task.error ?? "";
        if (reason.includes(TEXT_ONLY_MARKER)) {
          throw new MuseRefusedError(reason.slice(reason.indexOf(TEXT_ONLY_MARKER) + TEXT_ONLY_MARKER.length).replace(/^[\s:：]+/, ""));
        }
        // muse2api keeps region-blocked accounts for images and says so when none may make videos.
        if (isRegionBlock(reason)) throw new MuseRefusedError(reason);
        throw new MuseError(`Muse generation failed: ${task.error ?? "unknown error"}`);
      }
      await sleep(POLL_INTERVAL_MS);
    }
    throw new MuseError(`Timed out waiting for ${pathname}`);
  }

  private async download(url: string | undefined, fallbackExt: string): Promise<GeneratedMedia> {
    if (!url) throw new MuseError("Muse task completed without a media URL");
    const absolute = url.startsWith("http") ? url : `${this.base}${url}`;
    const res = await fetch(absolute, {
      headers: { Authorization: `Bearer ${env().MUSE2API_KEY}` },
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new MuseError(`Failed to download ${absolute}: ${res.status}`);
    const ext = path.extname(new URL(absolute).pathname).toLowerCase() || fallbackExt;
    return { data: Buffer.from(await res.arrayBuffer()), ext };
  }
}

function taskId(res: TaskResponse) {
  const id = res.task_id ?? res.id;
  if (!id) throw new MuseError(`muse2api did not return a task id: ${JSON.stringify(res)}`);
  return id;
}
