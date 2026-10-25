import type { AspectRatio } from "@/db/schema";

export interface GeneratedMedia {
  data: Buffer;
  /** File extension including the dot, e.g. `.png` or `.mp4`. */
  ext: string;
}

export interface ImageRequest {
  prompt: string;
  aspectRatio: AspectRatio | "1:1";
  /** Optional reference image as a data URL or http(s) URL. */
  referenceImage?: string;
}

export interface VideoRequest {
  prompt: string;
  aspectRatio: AspectRatio;
  durationSeconds: number;
  /** Optional first frame as a data URL or http(s) URL. */
  firstFrame?: string;
}

/**
 * Everything the pipeline needs from a generation backend. Muse is the first
 * implementation; other providers (fal.ai, official Meta API, ...) plug in here.
 */
export interface GenerationProvider {
  readonly name: string;
  chat(prompt: string): Promise<string>;
  generateImage(req: ImageRequest): Promise<GeneratedMedia>;
  generateVideo(req: VideoRequest): Promise<GeneratedMedia>;
}
