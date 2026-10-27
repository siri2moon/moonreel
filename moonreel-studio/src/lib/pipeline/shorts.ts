import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import type { AspectRatio } from "@/db/schema";
import { exec } from "./render";
import { DARK, fitHeadline, h, INK, loadFonts, parseHeadline, type Node } from "./thumbnail";

const WIDTH = 1080;
const HEIGHT = 1920;

/** Shorts get at most this long; the planner aims for 25–58 s. */
export const SHORT_MIN_SECONDS = 25;
export const SHORT_MAX_SECONDS = 58;

// Where the text sits on the 1080×1920 frame. A horizontal source is shown as a 1080-wide band
// in the middle (y 656–1264) over a blurred copy of itself; the hook goes above it and the
// captions below, clear of the Shorts buttons on the right and the title at the bottom.
const HOOK_TOP = 200;
const CAPTION_TOP = 1300;
const CAPTION_MAX_WORDS = 12;
// The narration starts a moment into each scene and leaves a short tail (see renderFinal).
const VOICE_LEAD_IN_S = 0.25;
const VOICE_TAIL_S = 0.35;
const FADE_OUT_S = 0.4;

export type CaptionCue = { text: string; start: number; end: number };

/** Sentences, with long ones broken at commas or in half, so each caption fits three lines. */
function captionChunks(narration: string) {
  const chunks: string[] = [];
  for (const sentence of narration.trim().split(/(?<=[.!?…])\s+/)) {
    const words = sentence.split(/\s+/).filter(Boolean);
    if (words.length <= CAPTION_MAX_WORDS) {
      if (words.length) chunks.push(words.join(" "));
      continue;
    }
    const parts = sentence.split(/(?<=,)\s+/);
    if (parts.length > 1 && parts.every((p) => p.split(/\s+/).length <= CAPTION_MAX_WORDS)) {
      chunks.push(...parts);
      continue;
    }
    for (let i = 0; i < words.length; i += CAPTION_MAX_WORDS) {
      chunks.push(words.slice(i, i + CAPTION_MAX_WORDS).join(" "));
    }
  }
  return chunks;
}

/**
 * Caption cues for a run of scenes, relative to the start of the Short. Each scene's line is
 * split into short chunks timed by their length across the time the narrator speaks it.
 */
export function captionCues(scenes: { narration: string; start: number; end: number }[], offset: number) {
  const cues: CaptionCue[] = [];
  for (const scene of scenes) {
    const chunks = captionChunks(scene.narration);
    const from = scene.start + Math.min(VOICE_LEAD_IN_S, (scene.end - scene.start) / 4);
    const to = Math.max(from + 0.5, scene.end - VOICE_TAIL_S);
    const total = chunks.reduce((sum, c) => sum + c.length, 0) || 1;
    let t = from;
    for (const text of chunks) {
      const next = t + ((to - from) * text.length) / total;
      cues.push({ text, start: t - offset, end: next - offset });
      t = next;
    }
  }
  return cues;
}

function hookLayer(input: { hook: string; accent: string; brand: string }): Node {
  const { size, lines } = fitHeadline(parseHeadline(input.hook), {
    font: "Anton",
    uppercase: true,
    maxWidth: 960,
    maxLines: 3,
    maxSize: 112,
    minSize: 64,
    letterSpacing: 0.005,
  });
  const brand = input.brand.trim().toUpperCase();
  return h(
    "div",
    {
      width: WIDTH,
      height: HEIGHT,
      position: "relative",
      backgroundImage: "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 30%, rgba(0,0,0,0) 36%)",
    },
    h(
      "div",
      {
        position: "absolute",
        top: HOOK_TOP,
        left: 60,
        right: 60,
        flexDirection: "column",
        alignItems: "center",
      },
      brand &&
        h(
          "div",
          {
            fontFamily: "Montserrat",
            fontWeight: 700,
            fontSize: 26,
            letterSpacing: 5,
            color: DARK,
            backgroundColor: input.accent,
            padding: "8px 18px",
            borderRadius: 6,
            marginBottom: 22,
          },
          brand,
        ),
      ...lines.map((line) =>
        h(
          "div",
          {
            fontFamily: "Anton",
            fontSize: size,
            lineHeight: 1.02,
            letterSpacing: size * 0.005,
            textShadow: "0 5px 0 rgba(0,0,0,0.85), 0 10px 30px rgba(0,0,0,0.7)",
            whiteSpace: "nowrap",
          },
          ...line.map((w, i) =>
            h("span", { color: w.accent ? input.accent : INK, marginLeft: i ? size * 0.24 : 0 }, w.text),
          ),
        ),
      ),
    ),
  );
}

function captionLayer(text: string): Node {
  return h(
    "div",
    { width: WIDTH, height: HEIGHT, position: "relative" },
    h(
      "div",
      { position: "absolute", top: CAPTION_TOP, left: 70, right: 70, justifyContent: "center" },
      h(
        "div",
        {
          fontFamily: "Montserrat",
          fontWeight: 700,
          fontSize: 52,
          lineHeight: 1.25,
          color: INK,
          textAlign: "center",
          justifyContent: "center",
          textShadow: "0 3px 0 rgba(0,0,0,0.9), 0 0 18px rgba(0,0,0,0.85)",
        },
        text,
      ),
    ),
  );
}

async function png(node: Node) {
  const svg = await satori(node as never, { width: WIDTH, height: HEIGHT, fonts: await loadFonts() });
  return new Resvg(svg, { fitTo: { mode: "width", value: WIDTH } }).render().asPng();
}

/**
 * Cuts `seconds` of the final video from `start` into a 1080×1920 Short: the hook printed at
 * the top for the whole clip and the narration as burned-in captions. A horizontal video sits
 * in the middle over a blurred, darkened copy of itself.
 */
export async function renderShort(input: {
  source: string;
  sourceAspect: AspectRatio;
  start: number;
  seconds: number;
  hook: string;
  captions: CaptionCue[];
  accent: string;
  brand: string;
  outFile: string;
}) {
  const { seconds } = input;
  const dir = await mkdtemp(path.join(os.tmpdir(), "moonreel-short-"));
  try {
    // Satori renders and file writes, not DB queries.
    const layers = await Promise.all([
      png(hookLayer(input)),
      ...input.captions.map((c) => png(captionLayer(c.text))),
    ]);
    const files = await Promise.all(
      layers.map(async (data, i) => {
        const file = path.join(dir, `layer-${i}.png`);
        await writeFile(file, data);
        return file;
      }),
    );

    const base =
      input.sourceAspect === "16:9"
        ? [
            "[0:v]split=2[s0][s1]",
            `[s0]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},gblur=sigma=28,eq=brightness=-0.18:saturation=0.85[bg]`,
            `[s1]scale=${WIDTH}:-2[fg]`,
            "[bg][fg]overlay=0:(H-h)/2[l0]",
          ]
        : [`[0:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},setsar=1[l0]`];
    const overlays = files.map((_, i) => {
      const cue = i === 0 ? null : input.captions[i - 1];
      const enable = cue ? `:enable='between(t,${cue.start.toFixed(3)},${cue.end.toFixed(3)})'` : "";
      return `[l${i}][${i + 1}:v]overlay=0:0${enable}[l${i + 1}]`;
    });
    const filters = [
      ...base,
      ...overlays,
      `[l${files.length}]fps=30,format=yuv420p[v]`,
      `[0:a]afade=t=out:st=${Math.max(0, seconds - FADE_OUT_S).toFixed(3)}:d=${FADE_OUT_S}[a]`,
    ];

    await mkdir(path.dirname(input.outFile), { recursive: true });
    await exec("ffmpeg", [
      "-y", "-hide_banner",
      "-ss", input.start.toFixed(3), "-t", seconds.toFixed(3), "-i", input.source,
      ...files.flatMap((file) => ["-loop", "1", "-i", file]),
      "-filter_complex", filters.join(";"),
      "-map", "[v]",
      "-map", "[a]",
      "-t", seconds.toFixed(3),
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "20",
      "-c:a", "aac",
      "-b:a", "192k",
      "-movflags", "+faststart",
      input.outFile,
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
