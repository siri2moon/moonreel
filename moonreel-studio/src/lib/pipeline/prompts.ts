import { z } from "zod";
import type { AspectRatio, Character, Niche, Scene } from "@/db/schema";

export const scriptSchema = z.object({
  title: z.string().min(1),
  scenes: z
    .array(
      z.object({
        narration: z.string().min(1),
        visualPrompt: z.string().min(1),
        camera: z.string().default(""),
      }),
    )
    .min(1),
});

export type Script = z.infer<typeof scriptSchema>;

const ASPECT_LABEL: Record<AspectRatio, string> = {
  "9:16": "vertical 9:16 (TikTok / Reels / Shorts)",
  "16:9": "horizontal 16:9 (YouTube)",
};

function characterBlock(character: Character | null) {
  if (!character) return "No recurring character. Scenes may use any visuals that fit the topic.";
  return [
    `Recurring character: ${character.name}`,
    `Appearance: ${character.appearance}`,
    character.personality && `Personality / way of speaking: ${character.personality}`,
    "The character appears on screen in every scene and speaks the narration directly to the viewer.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildScriptPrompt(input: {
  niche: Niche;
  character: Character | null;
  topic: string;
  aspectRatio: AspectRatio;
}) {
  const { niche, character, topic, aspectRatio } = input;
  return `You are a professional short-form video scriptwriter. Write a script and reply with JSON only.

# Niche: ${niche.name}
${niche.description}

# Niche rules
${niche.scriptInstructions}

Tone: ${niche.tone || "natural"}
Narration language: ${niche.language}
Format: ${ASPECT_LABEL[aspectRatio]}

# Character
${characterBlock(character)}

# Topic
${topic}

# Hard constraints
- Exactly ${niche.sceneCount} scenes. Each scene is one ${niche.sceneSeconds}-second AI-generated video clip.
- "narration": what is spoken in that scene, in ${niche.language}, at most 25 words, so it fits ${niche.sceneSeconds} seconds.
- "visualPrompt": in English, describe what is on screen (setting, action, expression, lighting). Do not describe the character's looks, they are added automatically. No on-screen text.
- "camera": in English, one slow, smooth camera move (e.g. "slow push-in", "static medium shot"). Avoid fast action: it distorts the character.
- Scene 1 must hook the viewer in the first 2 seconds. The last scene ends with a call to action.

# Output
Reply with ONLY this JSON object, no markdown, no explanation:
{"title": "...", "scenes": [{"narration": "...", "visualPrompt": "...", "camera": "..."}]}`;
}

export function buildRepairPrompt(raw: string, error: string) {
  return `The following text should be a JSON object of shape {"title": string, "scenes": [{"narration": string, "visualPrompt": string, "camera": string}]} but it is invalid (${error}).
Fix it and reply with ONLY the corrected JSON object, nothing else.

${raw}`;
}

/** Returns the end index of the balanced JSON object starting at `start`, or -1. String-aware. */
function matchObjectEnd(text: string, start: number) {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}" && --depth === 0) {
      return i;
    }
  }
  return -1;
}

/**
 * Extracts and validates the script JSON from a chat reply.
 *
 * muse2api scrapes the reply from the muse.ai DOM while it streams, so the text can hold a
 * truncated draft glued to the final answer, plus prose or code fences. We try every
 * balanced `{...}` block and keep the last one that matches the schema.
 */
export function parseScript(raw: string): Script {
  let lastError: unknown = new Error("no JSON object found");
  let found: Script | undefined;
  for (let start = raw.indexOf("{"); start !== -1; start = raw.indexOf("{", start + 1)) {
    const end = matchObjectEnd(raw, start);
    if (end === -1) continue;
    try {
      found = scriptSchema.parse(JSON.parse(raw.slice(start, end + 1)));
    } catch (err) {
      lastError = err;
    }
  }
  if (found) return found;
  throw lastError;
}

function characterVisual(character: Character | null) {
  return character ? `${character.name}: ${character.appearance}` : "";
}

export function buildCharacterReferencePrompt(character: Character) {
  return `Character reference sheet portrait of ${characterVisual(character)}. Full body, front view, neutral pose, plain light grey background, even studio lighting, sharp details. No text, no watermark.`;
}

export function buildKeyframePrompt(input: {
  scene: Scene;
  niche: Niche;
  character: Character | null;
}) {
  const { scene, niche, character } = input;
  return [
    scene.visualPrompt,
    character &&
      `The main character is ${characterVisual(character)}. Keep the character exactly identical to the reference image (face, hair, outfit, colors, proportions).`,
    niche.visualStyle && `Visual style: ${niche.visualStyle}.`,
    "Single frame from a video, cinematic composition, no text, no captions, no watermark.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildVideoPrompt(input: {
  scene: Scene;
  niche: Niche;
  character: Character | null;
}) {
  const { scene, niche, character } = input;
  const speaker = character ? character.name : "A narrator";
  return [
    scene.visualPrompt,
    scene.camera && `Camera: ${scene.camera}.`,
    niche.visualStyle && `Visual style: ${niche.visualStyle}.`,
    character && `Keep ${character.name} looking exactly like in the first frame.`,
    `${speaker} says in ${niche.language}: "${scene.narration}"`,
    "Smooth, slow motion. No on-screen text or subtitles.",
  ]
    .filter(Boolean)
    .join(" ");
}
