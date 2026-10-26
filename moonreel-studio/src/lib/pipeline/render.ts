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

// Clip sound under a narrator voice-over: ambience stays audible, any stray speech recedes.
const AMBIENT_UNDER_VOICE = 0.25;
const VOICE_LEAD_IN_S = 0.25;
const VOICE_TAIL_S = 0.35;

/**
 * Normalizes every clip to the target frame/fps/audio format and concatenates them,
 * embedding the narration as a soft subtitle track and writing a sidecar .srt.
 * Clips with a `voice` file get it mixed over their own (lowered) sound; when the line runs
 * longer than the clip, the last frame is held until the voice finishes.
 */
export async function renderFinal(input: {
  clips: { file: string; narration: string; voice?: string }[];
  aspectRatio: AspectRatio;
  outFile: string;
  srtFile: string;
}) {
  const { clips, aspectRatio, outFile, srtFile } = input;
  const { w, h } = FRAME[aspectRatio];
  // Independent ffprobe processes, not queries: probing in parallel is just faster.
  const [infos, voices] = await Promise.all([
    Promise.all(clips.map((c) => probe(c.file))),
    Promise.all(clips.map((c) => (c.voice ? probe(c.voice) : null))),
  ]);
  const durations = infos.map((info, i) => {
    const voice = voices[i];
    return voice ? Math.max(info.duration, VOICE_LEAD_IN_S + voice.duration + VOICE_TAIL_S) : info.duration;
  });

  await writeFile(srtFile, buildSrt(clips.map((c) => c.narration), durations));

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
  const voiceInput = new Map<number, number>();
  clips.forEach((c, i) => {
    if (!c.voice) return;
    args.push("-i", c.voice);
    voiceInput.set(i, nextInput++);
  });
  const srtInput = nextInput;
  args.push("-i", srtFile);

  const filters: string[] = [];
  const concatInputs: string[] = [];
  const toStereo = "aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo";
  infos.forEach((info, i) => {
    const dur = durations[i].toFixed(3);
    const hold = durations[i] - info.duration;
    filters.push(
      `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30,format=yuv420p${
        hold > 0.001 ? `,tpad=stop_mode=clone:stop_duration=${hold.toFixed(3)}` : ""
      },trim=0:${dur},setpts=PTS-STARTPTS[v${i}]`,
    );
    const audioSrc = silentInput.get(i) ?? i;
    const voice = voiceInput.get(i);
    if (voice === undefined) {
      filters.push(`[${audioSrc}:a]${toStereo},apad,atrim=0:${dur},asetpts=PTS-STARTPTS[a${i}]`);
    } else {
      const delayMs = Math.round(VOICE_LEAD_IN_S * 1000);
      filters.push(
        `[${audioSrc}:a]${toStereo},volume=${AMBIENT_UNDER_VOICE},apad[amb${i}]`,
        `[${voice}:a]${toStereo},adelay=${delayMs}|${delayMs},apad[vo${i}]`,
        `[amb${i}][vo${i}]amix=inputs=2:duration=longest:normalize=0,atrim=0:${dur},asetpts=PTS-STARTPTS[a${i}]`,
      );
    }
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
  return { durationSeconds: durations.reduce((sum, d) => sum + d, 0) };
}
