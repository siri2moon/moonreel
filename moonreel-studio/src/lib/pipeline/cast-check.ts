import { z } from "zod";
import type { Character } from "@/db/schema";
import { gatewayConfigured, gatewayVision } from "@/lib/providers/gateway";

// Muse draws a cast member twice now and then (two Lenas in one shot, Pfotengedanken episode 1,
// Nov 2026), in keyframes and, more often, halfway through a clip that started right. A vision
// model counts the people and animals in each drawn frame and the shot is made again when
// there are more than the cast allows, or when a cast animal is missing from the keyframe.

const ANIMAL = /\b(dog|puppy|retriever|terrier|shepherd|poodle|labrador|spaniel|beagle|dachshund|cat|kitten|tomcat)\b/i;
const CAT = /\b(cat|kitten|tomcat)\b/i;
// People a shot description brings in besides the cast ("her partner, a man with short hair").
// Plain "woman", "man" or "figure" are left out: rewritten shots describe cast members that way.
const EXTRA_PERSON =
  /\b(partner|husband|wife|boyfriend|girlfriend|friend|stranger|neighbou?r|vet|veterinarian|child|kid|visitor|guest|passer-?by)\b/gi;
// Wording that allows any number of people or animals in the shot.
const MANY_PEOPLE = /\b(people|crowd|crowds|family|families|friends|passers-?by|pedestrians|guests|children|kids|men|women)\b/i;
const MANY_DOGS = /\b(dogs|puppies|other dog|another dog|second dog)\b/i;
const MANY_CATS = /\b(cats|kittens|other cat|another cat|second cat)\b/i;

/** How many times a shot is drawn (or animated) again before the scene fails. */
export const CAST_CHECK_ATTEMPTS = 3;

export interface CastLimits {
  /** At most this many people; null when the shot may show any number. */
  maxPeople: number | null;
  maxDogs: number | null;
  maxCats: number | null;
  /** Cast animals on screen in this shot, which a keyframe must show. */
  needDogs: number;
  needCats: number;
}

const isAnimal = (c: Character) => ANIMAL.test(c.appearance);
const isCat = (c: Character) => CAT.test(c.appearance);

/**
 * What a shot may show: every human cast member at most once (a cast member the script left out
 * may still wander in, which is not a duplicate), plus the extra people its description names.
 * Null when the project has no cast, so there is nobody to duplicate.
 */
export function castLimits(cast: Character[], onScreen: Character[], visualPrompt: string): CastLimits | null {
  if (cast.length === 0) return null;
  const described = cast.reduce((text, c) => text.replaceAll(c.name, ""), visualPrompt);
  const extras = described.match(EXTRA_PERSON)?.length ?? 0;
  const dogs = cast.filter((c) => isAnimal(c) && !isCat(c)).length;
  const cats = cast.filter(isCat).length;
  return {
    maxPeople: MANY_PEOPLE.test(described) ? null : cast.filter((c) => !isAnimal(c)).length + extras,
    maxDogs: dogs === 0 || MANY_DOGS.test(described) ? null : dogs,
    maxCats: cats === 0 || MANY_CATS.test(described) ? null : cats,
    needDogs: onScreen.filter((c) => isAnimal(c) && !isCat(c)).length,
    needCats: onScreen.filter(isCat).length,
  };
}

export function castCheckAvailable() {
  return gatewayConfigured();
}

const countSchema = z.object({
  people: z.coerce.number().int().min(0),
  dogs: z.coerce.number().int().min(0),
  cats: z.coerce.number().int().min(0),
});

// Tiny passers-by far behind the action are a normal park or street; they are not counted, so
// a doubled cast member (always drawn at full size) still is.
const QUESTION =
  'Count the people, dogs and cats in this illustration that are clearly visible: in the foreground or middle ground, including partly cut-off ones. Do not count tiny figures far away in the background. Reply with JSON only: {"people": n, "dogs": n, "cats": n}';

async function count(image: string) {
  const reply = await gatewayVision(QUESTION, [image]);
  const json = reply.match(/\{[^{}]*\}/)?.[0];
  if (!json) throw new Error(`The frame check gave no counts: ${reply.slice(0, 200)}`);
  return countSchema.parse(JSON.parse(json));
}

/**
 * Checks frames (data URLs) against the limits; returns what is wrong, or null when every frame
 * is fine. `keyframe` also requires the cast animals of the shot to be in the picture (a clip
 * may move them out of frame).
 */
export async function castProblem(frames: string[], limits: CastLimits, keyframe: boolean) {
  // One vision call per frame (a few per clip): HTTP calls, not DB queries.
  const counts = await Promise.all(frames.map(count));
  for (const [i, c] of counts.entries()) {
    const where = frames.length > 1 ? ` (frame ${i + 1} of ${frames.length})` : "";
    if (limits.maxPeople !== null && c.people > limits.maxPeople) {
      return `${c.people} people where at most ${limits.maxPeople} belong${where}`;
    }
    if (limits.maxDogs !== null && c.dogs > limits.maxDogs) return `${c.dogs} dogs where the cast has ${limits.maxDogs}${where}`;
    if (limits.maxCats !== null && c.cats > limits.maxCats) return `${c.cats} cats where the cast has ${limits.maxCats}${where}`;
    if (keyframe && c.dogs < limits.needDogs) return `the dog of the cast is missing${where}`;
    if (keyframe && c.cats < limits.needCats) return `the cat of the cast is missing${where}`;
  }
  return null;
}
