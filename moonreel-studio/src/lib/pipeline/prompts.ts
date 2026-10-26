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

export const scenesSchema = scriptSchema.pick({ scenes: true });

const ASPECT_LABEL: Record<AspectRatio, string> = {
  "9:16": "vertical 9:16 (TikTok / Reels / Shorts)",
  "16:9": "horizontal 16:9 (YouTube)",
};

const VOICE_OVER = "The narration is an off-screen voice-over: nobody in the shot speaks it.";

function characterBlock(character: Character | null, voiceOver: boolean) {
  if (!character) {
    return `No recurring character and no presenter on screen. ${VOICE_OVER} Scenes may use any visuals that fit the topic.`;
  }
  return [
    `Recurring character: ${character.name}`,
    `Appearance: ${character.appearance}`,
    character.personality && `Personality / way of speaking: ${character.personality}`,
    voiceOver
      ? `The character appears on screen in every scene. ${VOICE_OVER}`
      : "The character appears on screen in every scene and speaks the narration directly to the viewer.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Longest script Muse writes in one reply. Past this the reply outlasts muse2api's chat
 * timeout, so longer scripts are written as an outline first and then in parts.
 * Scripts written through Cloudflare AI Gateway are not split.
 */
export const SCRIPT_PART_SCENES = 12;

export const outlineSchema = z.object({
  title: z.string().min(1),
  beats: z.array(z.string().min(1)).min(1),
});

export type Outline = z.infer<typeof outlineSchema>;

type ScriptInput = {
  niche: Niche;
  character: Character | null;
  topic: string;
  aspectRatio: AspectRatio;
  placeReference?: boolean;
};

function brief({ niche, character, topic, aspectRatio }: ScriptInput) {
  return `# Niche: ${niche.name}
${niche.description}

# Niche rules
${niche.scriptInstructions}

Tone: ${niche.tone || "natural"}
Narration language: ${niche.language}
Format: ${ASPECT_LABEL[aspectRatio]}

# Character
${characterBlock(character, !!niche.narratorVoiceId)}

# Topic
${topic}`;
}

const SCENE_SHAPE = '{"narration": "...", "visualPrompt": "...", "camera": "..."}';

function sceneRules(niche: Niche) {
  return `- Each scene is one ${niche.sceneSeconds}-second AI-generated video clip.
- "narration": what is spoken in that scene, in ${niche.language}, at most 25 words, so it fits ${niche.sceneSeconds} seconds.
- "visualPrompt": in English, describe what is on screen (setting, action, expression, lighting). Do not describe the character's looks, they are added automatically. No on-screen text.
- "camera": in English, one slow, smooth camera move (e.g. "slow push-in", "static medium shot"). Avoid fast action: it distorts the character.`;
}

/** The whole script in one reply, for scripts up to SCRIPT_PART_SCENES scenes. */
export function buildScriptPrompt(input: ScriptInput) {
  const { niche } = input;
  return `You are a professional video scriptwriter. Write a script and reply with JSON only.

${brief(input)}

# Hard constraints
- Exactly ${niche.sceneCount} scenes.
${sceneRules(niche)}
- Scene 1 must hook the viewer in the first 2 seconds. The last scene ends with a call to action.

# Output
Reply with ONLY this JSON object, no markdown, no explanation:
{"title": "...", "scenes": [${SCENE_SHAPE}]}`;
}

/** Step 1 of a long script: the title and one short story beat per scene. */
export function buildOutlinePrompt(input: ScriptInput) {
  const { niche } = input;
  return `You are a professional video scriptwriter. Plan a ${niche.sceneCount}-scene video and reply with JSON only.

${brief(input)}

# Hard constraints
- Exactly ${niche.sceneCount} beats, one per ${niche.sceneSeconds}-second scene, in story order.
- Each beat: one English sentence of at most 15 words saying what happens and what the scene reveals.
- Beat 1 hooks the viewer in the first 2 seconds. The last beat ends with a call to action.

# Output
Reply with ONLY this JSON object, no markdown, no explanation:
{"title": "...", "beats": ["...", "..."]}`;
}

/** Step 2 of a long script: full scenes `from`..`to` (1-based) of the outline. */
export function buildScriptPartPrompt(
  input: ScriptInput & { outline: Outline; from: number; to: number; previous: string[] },
) {
  const { niche, outline, from, to, previous } = input;
  const beats = outline.beats.map((b, i) => `${i + 1}. ${b}`).join("\n");
  return `You are a professional video scriptwriter writing "${outline.title}" in parts. Reply with JSON only.

${brief(input)}

# Full outline (${outline.beats.length} scenes)
${beats}
${previous.length ? `\n# Narration just before this part (continue from here, do not repeat it)\n${previous.join("\n")}\n` : ""}
# Hard constraints
- Write scenes ${from} to ${to} only: exactly ${to - from + 1} scenes, following beats ${from}–${to}.
${sceneRules(niche)}

# Output
Reply with ONLY this JSON object, no markdown, no explanation:
{"scenes": [${SCENE_SHAPE}]}`;
}

/**
 * Shots for an ambient video: one place, filmed from a few angles, that loops quietly under a
 * soundtrack. "narration" holds a short shot note for the editor; nothing is spoken.
 */
export function buildAmbientScriptPrompt(input: ScriptInput) {
  const { niche, character, topic, aspectRatio } = input;
  return `You design looping ambient background videos for music and soundscapes (study, relax, sleep). Reply with JSON only.

# Niche: ${niche.name}
${niche.description}

# Niche rules
${niche.scriptInstructions}

Mood: ${niche.tone || "calm, cosy"}
Format: ${ASPECT_LABEL[aspectRatio]}

# Place
${topic}
${input.placeReference ? "\nThe user also attached a photo of this place, which the image generator uses as a visual guide. Keep every shot consistent with the description above and spend the words on what moves and the atmosphere.\n" : ""}
${character ? `# Character\n${characterVisual(character)}. Appears in every shot doing something calm (reading, sipping, looking out); never talks to the camera, never moves fast.\n` : ""}# Hard constraints
${
  niche.fixedCamera
    ? `- Exactly ${niche.sceneCount} shots from ONE locked-off camera that never moves: every shot has the identical framing, composition, place, time of day, weather and colour palette. Shot 1 sets the frame; the others reuse its first image.
- Shot 1's "visualPrompt" describes the whole frame in full detail. Every later shot repeats that same frame description word for word and only changes how the things already in it move (e.g. heavier rain, mist rolling lower, steam rising from the cup, branches swaying harder, the lamp flickering), so each clip brings different life to the same picture.
- Every shot contains exactly the objects of shot 1: never add, remove or replace a person, animal, vehicle or thing. People only appear if shot 1 already has them, and only where they make sense.`
    : `- Exactly ${niche.sceneCount} shots of the SAME place at the same time of day, weather and colour palette, so they cut together as one location.`
}
- Each shot is one ${niche.sceneSeconds}-second AI-generated clip that will loop for a long time: gentle, continuous, repeating motion only (leaves and branches swaying, steam rising, rain falling, candle or neon flicker, clouds drifting, water rippling; people strolling far away only where the place naturally has them, such as a street). No events, no one entering close to the camera, nothing that starts or ends.
- "visualPrompt": in English, the full shot: setting, what moves and how, lighting, atmosphere. No readable text, signs or logos. No close-up faces.
- "camera": "locked-off static shot" for every shot. The camera is on a tripod: no zoom, push-in, pan, tilt, dolly or drift.
- "narration": a shot note in ${niche.language}, at most 8 words, naming the shot (e.g. "Window seat, rain on the glass"). It is never spoken or shown.
- "title": a YouTube-style title naming the place and the mood.

# Output
Reply with ONLY this JSON object, no markdown, no explanation:
{"title": "...", "scenes": [${SCENE_SHAPE}]}`;
}

export function buildRepairPrompt(raw: string, error: string, shape: string) {
  return `The following text should be a JSON object of shape ${shape} but it is invalid (${error}).
Fix it and reply with ONLY the corrected JSON object, nothing else.

${raw}`;
}

export const postsSchema = z.object({
  youtube: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    tags: z.array(z.string()).default([]),
    chapters: z.array(z.object({ scene: z.number().int(), title: z.string().min(1) })).default([]),
  }),
  tiktok: z.object({ caption: z.string().min(1) }),
  instagram: z.object({ caption: z.string().min(1) }),
  facebook: z.object({ caption: z.string().min(1) }),
  thumbnail: z.object({
    text: z.string().min(1),
    prompt: z.string().min(1),
    scene: z.number().int().default(1),
  }),
});

export type PostsReply = z.infer<typeof postsSchema>;

export const POSTS_SHAPE =
  '{"youtube": {"title": string, "description": string, "tags": [string], "chapters": [{"scene": number, "title": string}]}, "tiktok": {"caption": string}, "instagram": {"caption": string}, "facebook": {"caption": string}, "thumbnail": {"text": string, "prompt": string, "scene": number}}';

/** Captions for every platform, written from the finished script. */
export function buildPostsPrompt(input: {
  niche: Niche;
  title: string;
  topic: string;
  aspectRatio: AspectRatio;
  durationSeconds: number;
  narration: string[];
}) {
  const { niche, aspectRatio, narration } = input;
  const minutes = Math.max(1, Math.round(input.durationSeconds / 60));
  const vertical = aspectRatio === "9:16";
  const ambient = niche.format === "ambient";
  const script = narration.map((line, i) => `${i + 1}. ${line}`).join("\n");
  const length = minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
  return `You are a social media manager who writes captions that get videos found and watched. Reply with JSON only.

# Video
Title: ${input.title}
Topic: ${input.topic}
Niche: ${niche.name}. ${niche.description}
Format: ${ASPECT_LABEL[aspectRatio]}, about ${length}
Audience language: ${niche.language}
${
  ambient
    ? `
# What the video is
A looping ambient visual played under a soundtrack, for studying, working, relaxing or sleeping. There is no narration and no story. The shots it loops through:
${script}`
    : `
# Narration, numbered by scene
${script}`
}

# Rules
- Write everything in ${niche.language}, for viewers of that language.
- Be accurate to the ${ambient ? "shots and the place" : "narration"}: no claims the video does not make, no fake urgency, no clickbait the video does not pay off.
${
  ambient
    ? `- youtube.title: at most 90 characters, in the style of ambience channels: the place and mood first, then what it is for and the length, e.g. "Rainy Night Café ☕ Soft Jazz & Rain Sounds for Study, Sleep (${length})". At most 2 emoji.
- youtube.description: 2 opening lines that set the scene and contain the main keywords (they show in search), then a short paragraph inviting the viewer to stay a while, then one line asking to subscribe for more ambience, then 3 hashtags on the last line. No links, no chapter list.`
    : `- youtube.title: at most 70 characters, main search keyword near the start, curiosity without lying.
- youtube.description: 2 opening lines that hook and contain the main keywords (they show in search), then a short paragraph on what the viewer learns, then one line asking to subscribe, then 3 hashtags on the last line. No links, no chapter list.`
}
- youtube.tags: 10–15 search phrases a viewer would type, most specific first, no "#".
- youtube.chapters: ${vertical || ambient ? "an empty array." : `5–8 chapters that follow the story; "scene" is the scene number where the chapter starts, the first chapter starts at scene 1, chapter titles at most 40 characters.`}
- tiktok.caption: one punchy hook line plus 4–6 hashtags, at most 300 characters.
- instagram.caption: a hook line, 2–3 short lines of story, a question that invites comments, then 5–8 hashtags.
- facebook.caption: 2–4 conversational sentences that make people want to watch and comment, at most 2 hashtags.
${
  ambient
    ? `- thumbnail.text: the words printed on the thumbnail, in ${niche.language}: 2–4 calm words naming the mood or use, at most 24 characters, e.g. "*RAINY* CAFÉ NIGHT" or "STUDY *WITH ME*". Wrap 1–2 words in *stars* to colour them.
- thumbnail.prompt: in English, the most inviting wide view of the place, warm and atmospheric, with a calm, uncluttered area for the text. No text in the image.`
    : `- thumbnail.text: the words printed on the thumbnail, in ${niche.language}: 2–5 words, at most 28 characters, that add curiosity to the title instead of repeating it (a stake, a number, a contrast, a question). Wrap the 1–2 most important words in *stars* to colour them, e.g. "ONE LION vs *1,000 POUNDS*".
- thumbnail.prompt: in English, one striking photo for the thumbnail background: a single clear focal subject, close and large, frozen at the most dramatic moment the video actually shows, strong emotion, setting and light. No text in the image. Nothing graphic or gory.`
}
- thumbnail.scene: the scene number whose image would make the best thumbnail if the photo cannot be made.

# Output
Reply with ONLY this JSON object, no markdown, no explanation:
${POSTS_SHAPE}`;
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
 * Extracts and validates a JSON object from a chat reply.
 *
 * muse2api scrapes the reply from the muse.ai DOM while it streams, so the text can hold a
 * truncated draft glued to the final answer, plus prose or code fences. We try every
 * balanced `{...}` block and keep the last one that matches the schema.
 */
export function parseReply<T>(raw: string, schema: z.ZodType<T>): T {
  let lastError: unknown = new Error("no JSON object found");
  let found: T | undefined;
  for (let start = raw.indexOf("{"); start !== -1; start = raw.indexOf("{", start + 1)) {
    const end = matchObjectEnd(raw, start);
    if (end === -1) continue;
    try {
      found = schema.parse(JSON.parse(raw.slice(start, end + 1)));
    } catch (err) {
      lastError = err;
    }
  }
  if (found !== undefined) return found;
  throw lastError;
}

function characterVisual(character: Character | null) {
  return character ? `${character.name}: ${character.appearance}` : "";
}

const THUMBNAIL_COMPOSITION: Record<string, Record<AspectRatio, string>> = {
  cinematic: {
    "16:9": "Subject in the upper two-thirds; the lower third darker and uncluttered, where the headline goes.",
    "9:16": "Subject in the upper-middle of the frame; the lower part darker and uncluttered.",
  },
  side: {
    "16:9": "Subject large on the right half, facing left; the left half simpler and darker, where the headline goes.",
    "9:16": "Subject large in the lower half; the upper part simpler and darker, where the headline goes.",
  },
};

/** Background for a thumbnail: framed so the niche's template has room for its headline. */
export function buildThumbnailPrompt(input: {
  niche: Niche;
  character: Character | null;
  prompt: string;
  aspectRatio: AspectRatio;
  placeReference?: boolean;
}) {
  const { niche, character, aspectRatio } = input;
  const composition = THUMBNAIL_COMPOSITION[niche.thumbnailStyle === "cinematic" ? "cinematic" : "side"];
  return [
    `YouTube thumbnail photo, ${ASPECT_LABEL[aspectRatio]}.`,
    input.placeReference && "Show the place in the reference photo: its layout, materials, colours and light.",
    input.prompt,
    characterVisual(character),
    composition[aspectRatio],
    niche.format === "ambient"
      ? "Wide, inviting establishing view, soft warm light, gentle depth, rich but calm colour, crisp detail."
      : "One clear focal subject, sharp eyes, strong emotion, dramatic rim light, high contrast, rich saturated colour, shallow depth of field, crisp detail.",
    niche.visualStyle && `Visual style: ${niche.visualStyle}.`,
    "No text, letters, numbers, logos, watermarks or borders. Nothing graphic or gory.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildCharacterReferencePrompt(character: Character) {
  return `Character reference sheet portrait of ${characterVisual(character)}. Full body, front view, neutral pose, plain light grey background, even studio lighting, sharp details. No text, no watermark.`;
}

export function buildKeyframePrompt(input: {
  scene: Scene;
  niche: Niche;
  character: Character | null;
  /** The reference image is a photo of the place rather than the character sheet. */
  placeReference?: boolean;
}) {
  const { scene, niche, character, placeReference } = input;
  return [
    placeReference &&
      "Use the reference photo as a guide to the place: its layout, windows, furniture, materials, colours and light. Where the photo and the description differ, follow the description. Scene:",
    scene.visualPrompt,
    character &&
      (placeReference
        ? `The main character is ${characterVisual(character)}.`
        : `The main character is ${characterVisual(character)}. Keep the character exactly identical to the reference image (face, hair, outfit, colors, proportions).`),
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
  if (niche.format === "ambient") {
    return [
      scene.visualPrompt,
      // Muse tends to add a slow push-in; jobs.ts also measures each clip and redoes moving ones.
      "Camera: locked-off static shot on a tripod. The camera does not move at all: no zoom, no push-in, no pull-out, no pan, no tilt, no dolly, no drift, no shake, no cuts. The framing of the last frame is identical to the first.",
      niche.visualStyle && `Visual style: ${niche.visualStyle}.`,
      character && `Keep ${character.name} looking exactly like in the first frame; calm, small movements only.`,
      // The clip loops under a soundtrack: steady motion from the first frame to the last.
      "Animate only what is already in the first frame: do not add, remove or replace any person, animal, vehicle or object.",
      "Gentle, continuous ambient motion that stays the same throughout; nothing starts, stops, enters or leaves the frame. The last frame should look much like the first.",
      "No speech, no music. No on-screen text or subtitles.",
    ]
      .filter(Boolean)
      .join(" ");
  }
  return [
    scene.visualPrompt,
    scene.camera && `Camera: ${scene.camera}.`,
    niche.visualStyle && `Visual style: ${niche.visualStyle}.`,
    character && `Keep ${character.name} looking exactly like in the first frame.`,
    niche.narratorVoiceId
      ? // The narrator voice is added at render time; any speech here would talk over it.
        "Natural ambient sound only: no speech, no narration, no music."
      : character
        ? `${character.name} says in ${niche.language}: "${scene.narration}"`
        : // Spelled out so Muse does not put a presenter in frame or make the animals lip-sync.
          `Off-screen voice-over narration in ${niche.language}${niche.tone ? ` (voice: ${niche.tone})` : ""}, nobody on screen speaks: "${scene.narration}"`,
    "Smooth, slow motion. No on-screen text or subtitles.",
  ]
    .filter(Boolean)
    .join(" ");
}
