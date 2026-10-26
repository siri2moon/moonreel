import { spawn } from "node:child_process";
import { rm, writeFile } from "node:fs/promises";
import type { AspectRatio } from "@/db/schema";

const FRAME: Record<AspectRatio, { w: number; h: number }> = {
  "9:16": { w: 720, h: 1280 },
  "16:9": { w: 1280, h: 720 },
};

function exec(cmd: string, args: string[]) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(cmd, args);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-1500)}`)),
    );
  });
}

async function run(cmd: string, args: string[]) {
  return (await exec(cmd, args)).stdout;
}

/** ffmpeg writes filter results (e.g. SSIM) to its log on stderr. */
async function ffmpegLog(args: string[]) {
  return (await exec("ffmpeg", args)).stderr;
}

interface ClipInfo {
  duration: number;
  hasAudio: boolean;
}

export async function probe(file: string): Promise<ClipInfo> {
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

/**
 * How still the camera stayed: the lowest SSIM between the first frame and frames a third,
 * two thirds and all the way through. Rain, steam and passers-by keep it around 0.85–0.9;
 * a zoom or pan drops it to about 0.5.
 */
export async function cameraStillness(file: string) {
  const { duration } = await probe(file);
  const points = [duration / 3, (duration * 2) / 3, Math.max(0, duration - 0.3)];
  // Independent ffmpeg processes, not queries.
  const scores = await Promise.all(
    points.map(async (t) => {
      const log = await ffmpegLog([
        "-hide_banner",
        "-i", file,
        "-ss", t.toFixed(3), "-i", file,
        "-filter_complex",
        "[0:v]trim=end_frame=1,setpts=PTS-STARTPTS,scale=640:-2[a];[1:v]trim=end_frame=1,setpts=PTS-STARTPTS,scale=640:-2[b];[a][b]ssim",
        "-f", "null", "-",
      ]);
      const score = Number(log.match(/All:([0-9.]+)/)?.[1]);
      if (!Number.isFinite(score)) throw new Error(`Cannot measure camera motion of ${file}`);
      return score;
    }),
  );
  return Math.min(...scores);
}

export async function mediaDuration(file: string) {
  return (await probe(file)).duration;
}

// Long enough to hide the seam between two clips, short enough to leave most of each clip clean.
const LOOP_CROSSFADE_S = 1.5;

function normalizeVideo(w: number, h: number) {
  return `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,fps=30,format=yuv420p`;
}

/**
 * Background video for a soundtrack: the clips crossfade into one another and the last one
 * fades back into the first, so the result loops without a visible seam. That loop is
 * repeated (without re-encoding) until the audio ends. The clips' own sound is dropped.
 */
export async function renderLoop(input: {
  clips: string[];
  audio: string;
  aspectRatio: AspectRatio;
  outFile: string;
}) {
  const { clips, audio, aspectRatio, outFile } = input;
  const { w, h } = FRAME[aspectRatio];
  // Independent ffprobe processes, not queries: probing in parallel is just faster.
  const [durations, audioSeconds] = await Promise.all([
    Promise.all(clips.map(mediaDuration)),
    mediaDuration(audio),
  ]);
  const fade = Math.min(LOOP_CROSSFADE_S, Math.min(...durations) / 3);

  // Clip 1 goes in a second time at the end: the seam fades into it, and the loop is cut where
  // that copy reaches the frame the loop starts on.
  const sequence = [...clips, clips[0]];
  const lengths = [...durations, durations[0]];
  const filters = sequence.map(
    (_, i) =>
      // tpad + trim pin every clip to its probed length, which the crossfade offsets rely on.
      `[${i}:v]${normalizeVideo(w, h)},tpad=stop_mode=clone:stop_duration=1,trim=0:${lengths[i].toFixed(3)},setpts=PTS-STARTPTS[c${i}]`,
  );
  let previous = "c0";
  let offset = 0;
  for (let i = 1; i < sequence.length; i++) {
    offset += lengths[i - 1] - fade;
    filters.push(`[${previous}][c${i}]xfade=transition=fade:duration=${fade.toFixed(3)}:offset=${offset.toFixed(3)}[x${i}]`);
    previous = `x${i}`;
  }
  const period = durations.reduce((sum, d) => sum + d, 0) - clips.length * fade;
  filters.push(`[${previous}]trim=start=${fade.toFixed(3)}:duration=${period.toFixed(3)},setpts=PTS-STARTPTS[v]`);

  const loopFile = outFile.replace(/(\.mp4)?$/, "-loop.mp4");
  await run("ffmpeg", [
    "-y", "-hide_banner",
    ...sequence.flatMap((file) => ["-i", file]),
    "-filter_complex", filters.join(";"),
    "-map", "[v]",
    "-an",
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "18",
    "-movflags", "+faststart",
    loopFile,
  ]);

  // Copying the looped video keeps an hour-long render to seconds; only the audio is encoded.
  await run("ffmpeg", [
    "-y", "-hide_banner",
    "-stream_loop", "-1", "-i", loopFile,
    "-i", audio,
    "-map", "0:v",
    "-map", "1:a",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "192k",
    "-t", audioSeconds.toFixed(3),
    "-movflags", "+faststart",
    outFile,
  ]);
  await rm(loopFile, { force: true });
  return { durationSeconds: audioSeconds, loopSeconds: period };
}
