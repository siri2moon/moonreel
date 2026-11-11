import { env } from "@/lib/env";

export class VoiceStudioError extends Error {}

/** Narrator voice ids with this prefix are read by a local VoiceStudio instead of ElevenLabs. */
export const VOICESTUDIO_PREFIX = "voicestudio:";

// OmniVoice speaks German well with a fixed seed; the same seed keeps the delivery steady
// from line to line on top of the cloned voice profile.
const SEED = 42;

/**
 * Text to speech with a local VoiceStudio (github.com/debpalash/voicestudio) through its
 * OpenAI-compatible endpoint. `voice` is a VoiceStudio voice profile id or name.
 */
export async function synthesizeLocalSpeech(input: { voice: string; text: string; language?: string }) {
  const res = await fetch(`${env().VOICESTUDIO_BASE_URL}/v1/audio/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "omnivoice",
      input: input.text,
      voice: input.voice,
      language: input.language,
      seed: SEED,
      response_format: "mp3",
    }),
    // The first line also loads the model, which takes most of a minute.
    signal: AbortSignal.timeout(300_000),
  }).catch((err: unknown) => {
    throw new VoiceStudioError(
      `VoiceStudio is not reachable at ${env().VOICESTUDIO_BASE_URL}: open the VoiceStudio app (${err instanceof Error ? err.message : String(err)})`,
    );
  });
  if (!res.ok) {
    throw new VoiceStudioError(`VoiceStudio ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
