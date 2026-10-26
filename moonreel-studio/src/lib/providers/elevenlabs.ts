import { env } from "@/lib/env";

export class ElevenLabsError extends Error {}

/**
 * Text to speech with ElevenLabs. `previousText`/`nextText` let the model carry intonation
 * across scenes, so separately synthesized lines still sound like one continuous read.
 */
export async function synthesizeSpeech(input: {
  voiceId: string;
  text: string;
  previousText?: string;
  nextText?: string;
}): Promise<Buffer> {
  const { ELEVENLABS_API_KEY, ELEVENLABS_MODEL } = env();
  if (!ELEVENLABS_API_KEY) {
    throw new ElevenLabsError("ELEVENLABS_API_KEY is not set: add it to .env to use a narrator voice");
  }
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(input.voiceId)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: input.text,
        model_id: ELEVENLABS_MODEL,
        previous_text: input.previousText,
        next_text: input.nextText,
      }),
      signal: AbortSignal.timeout(120_000),
    },
  );
  if (!res.ok) {
    throw new ElevenLabsError(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
