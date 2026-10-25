import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import type { AspectRatio } from "@/db/schema";

const FRAME: Record<AspectRatio, { w: number; h: number }> = {
  "9:16": { w: 720, h: 1280 },
  "16:9": { w: 1280, h: 720 },
};

function run(cmd: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(cmd, args);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(stdout) : reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-1500)}`)),
    );
  });
}

interface ClipInfo {
  duration: number;
  hasAudio: boolean;
}

async function probe(file: string): Promise<ClipInfo> {
  const out = await run("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration:stream=codec_type",
    "-of", "json",
    file,
  ]);
  const info = JSON.parse(out) as {
    format?: { duration?: string };
    streams?: { codec_type: string }[];
  };
  const duration = Number(info.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`Cannot read duration of ${file}`);
  return { duration, hasAudio: !!info.streams?.some((s) => s.codec_type === "audio") };
}

function srtTime(seconds: number) {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`;
}

function buildSrt(lines: string[], durations: number[]) {
  let t = 0;
  return lines
    .map((line, i) => {
      const start = t;
      t += durations[i];
      return `${i + 1}\n${srtTime(start)} --> ${srtTime(t)}\n${line}\n`;
    })
    .join("\n");
}

/**
 * Normalizes every clip to the target frame/fps/audio format and concatenates them,
 * embedding the narration as a soft subtitle track and writing a sidecar .srt.
 */
export async function renderFinal(input: {
  clips: { file: string; narration: string }[];
  aspectRatio: AspectRatio;
  outFile: string;
  srtFile: string;
}) {
  const { clips, aspectRatio, outFile, srtFile } = input;
  const { w, h } = FRAME[aspectRatio];
  // Independent ffprobe processes, not queries: probing in parallel is just faster.
  const infos = await Promise.all(clips.map((c) => probe(c.file)));

  await writeFile(srtFile, buildSrt(clips.map((c) => c.narration), infos.map((i) => i.duration)));

  const args: string[] = ["-y", "-hide_banner"];
  for (const c of clips) args.push("-i", c.file);

  // Silent audio inputs for clips that came back without sound, so concat stays aligned.
  const silentInput = new Map<number, number>();
  let nextInput = clips.length;
  infos.forEach((info, i) => {
    if (info.hasAudio) return;
    args.push("-f", "lavfi", "-t", info.duration.toFixed(3), "-i", "anullsrc=r=44100:cl=stereo");
    silentInput.set(i, nextInput++);
  });
  const srtInput = nextInput;
  args.push("-i", srtFile);

  const filters: string[] = [];
  const concatInputs: string[] = [];
  infos.forEach((info, i) => {
    const dur = info.duration.toFixed(3);
    filters.push(
      `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30,format=yuv420p,trim=0:${dur},setpts=PTS-STARTPTS[v${i}]`,
    );
    const audioSrc = silentInput.get(i) ?? i;
    filters.push(
      `[${audioSrc}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=0:${dur},asetpts=PTS-STARTPTS[a${i}]`,
    );
    concatInputs.push(`[v${i}][a${i}]`);
  });
  filters.push(`${concatInputs.join("")}concat=n=${clips.length}:v=1:a=1[v][a]`);

  args.push(
    "-filter_complex", filters.join(";"),
    "-map", "[v]",
    "-map", "[a]",
    "-map", `${srtInput}:s`,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "20",
    "-c:a", "aac",
    "-b:a", "192k",
    "-c:s", "mov_text",
    "-movflags", "+faststart",
    outFile,
  );

  await run("ffmpeg", args);
  return { durationSeconds: infos.reduce((sum, i) => sum + i.duration, 0) };
}
