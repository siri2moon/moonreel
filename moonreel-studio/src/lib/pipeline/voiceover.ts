import { createHash } from "node:crypto";
import { access } from "node:fs/promises";
import { env } from "@/lib/env";
import { synthesizeSpeech } from "@/lib/providers/elevenlabs";
import { resolveKey, saveFile } from "@/lib/storage";

// ElevenLabs plans allow only a few concurrent requests; more just get 429s.
const TTS_CONCURRENCY = 2;

/**
 * Reads every narration line in one narrator voice and returns the audio file per line.
 * Lines are cached by voice, model and text (including neighbours, which shape intonation),
 * so a re-render or a single edited scene only synthesizes what changed.
 */
export async function synthesizeNarration(voiceId: string, lines: string[]) {
  const model = env().ELEVENLABS_MODEL;
  const jobs = lines.map((text, i) => {
    const previousText = lines[i - 1];
    const nextText = lines[i + 1];
    const hash = createHash("sha256")
      .update(JSON.stringify([voiceId, model, text, previousText ?? "", nextText ?? ""]))
      .digest("hex")
      .slice(0, 32);
    return { key: `voiceovers/${hash}.mp3`, text, previousText, nextText };
  });

  // A tiny worker pool: these are HTTP calls to ElevenLabs, not DB queries, and the pool
  // exists to cap concurrency at what the API accepts.
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      const exists = await access(resolveKey(job.key)).then(() => true, () => false);
      if (exists) continue;
      const audio = await synthesizeSpeech({ voiceId, ...job });
      await saveFile(job.key, audio);
    }
  };
  await Promise.all(Array.from({ length: Math.min(TTS_CONCURRENCY, jobs.length) }, worker));
  return jobs.map((j) => resolveKey(j.key));
}
