import { relations } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const aspectRatioEnum = pgEnum("aspect_ratio", ["9:16", "16:9"]);

/**
 * "story": a narrated script, one clip per line. "ambient": a looping background for a
 * soundtrack the user uploads; scenes carry only a short shot note, nothing is spoken.
 */
export const nicheFormatEnum = pgEnum("niche_format", ["story", "ambient"]);

export const referenceStatusEnum = pgEnum("reference_status", [
  "none",
  "generating",
  "ready",
  "failed",
]);

export const projectStatusEnum = pgEnum("project_status", [
  "scripting",
  "script_ready",
  "producing",
  "rendering",
  "done",
  "failed",
]);

export const postsStatusEnum = pgEnum("posts_status", ["none", "writing", "ready", "failed"]);

/** Ready-to-paste captions for each platform, written after the video is rendered. */
export type SocialPosts = {
  youtube: {
    title: string;
    description: string;
    tags: string[];
    /** Chapter start in seconds, measured on the rendered video. Empty for vertical videos. */
    chapters: { start: number; title: string }[];
  };
  tiktok: { caption: string };
  instagram: { caption: string };
  facebook: { caption: string };
};

export const thumbnailStatusEnum = pgEnum("thumbnail_status", ["none", "drawing", "ready", "failed"]);

/** What the thumbnail shows. The look (template, accent, brand) comes from the niche. */
export type ThumbnailSpec = {
  /** Headline; words wrapped in *stars* are drawn in the accent colour. */
  text: string;
  /** English description of the background image Muse draws. */
  prompt: string;
  /** "ai": a dedicated Muse image; "scene": the keyframe of `scene`. */
  background: "ai" | "scene";
  /** 1-based scene whose keyframe is used for "scene", and as the fallback when Muse declines. */
  scene: number;
  basePath: string | null;
  path: string | null;
  /** Set when the background fell back to a keyframe, with Muse's reason. */
  note: string | null;
};

export const sceneStatusEnum = pgEnum("scene_status", [
  "pending",
  "keyframe",
  "video",
  "done",
  "failed",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const niches = pgTable("niches", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  scriptInstructions: text("script_instructions").notNull(),
  tone: text("tone").notNull().default(""),
  visualStyle: text("visual_style").notNull().default(""),
  sceneCount: integer("scene_count").notNull().default(6),
  sceneSeconds: integer("scene_seconds").notNull().default(10),
  language: text("language").notNull().default("Vietnamese"),
  icon: text("icon").notNull().default("✦"),
  format: nicheFormatEnum("format").notNull().default("story"),
  /** Ambient only: every shot reuses scene 1's keyframe, so the camera never changes angle. */
  fixedCamera: boolean("fixed_camera").notNull().default(false),
  defaultAspectRatio: aspectRatioEnum("default_aspect_ratio").notNull().default("9:16"),
  // ElevenLabs voice for an off-screen narrator. When set, clips keep only ambient sound
  // and the whole narration is read in this one voice at render time.
  narratorVoiceId: text("narrator_voice_id"),
  /** Thumbnail template (see THUMBNAIL_STYLES), accent colour and brand label shared by the niche. */
  thumbnailStyle: text("thumbnail_style").notNull().default("impact"),
  thumbnailAccent: text("thumbnail_accent").notNull().default("#FFC23D"),
  thumbnailBrand: text("thumbnail_brand").notNull().default(""),
  defaultCharacterId: uuid("default_character_id").references((): AnyPgColumn => characters.id, {
    onDelete: "set null",
  }),
  ...timestamps,
});

export const characters = pgTable("characters", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  appearance: text("appearance").notNull(),
  personality: text("personality").notNull().default(""),
  referenceImagePath: text("reference_image_path"),
  referenceStatus: referenceStatusEnum("reference_status").notNull().default("none"),
  referenceError: text("reference_error"),
  ...timestamps,
});

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  topic: text("topic").notNull(),
  nicheId: uuid("niche_id")
    .notNull()
    .references(() => niches.id, { onDelete: "restrict" }),
  characterId: uuid("character_id").references(() => characters.id, {
    onDelete: "set null",
  }),
  aspectRatio: aspectRatioEnum("aspect_ratio").notNull(),
  status: projectStatusEnum("status").notNull().default("scripting"),
  error: text("error"),
  finalVideoPath: text("final_video_path"),
  captionsPath: text("captions_path"),
  /** Uploaded soundtrack of an ambient video; the clips loop until it ends. */
  audioPath: text("audio_path"),
  /** Length of the soundtrack, which is also the length of the final ambient video. */
  audioSeconds: real("audio_seconds"),
  /** Optional photo of the place; Muse copies it when drawing keyframes and the thumbnail. */
  referenceImagePath: text("reference_image_path"),
  posts: jsonb("posts").$type<SocialPosts>(),
  postsStatus: postsStatusEnum("posts_status").notNull().default("none"),
  postsError: text("posts_error"),
  thumbnail: jsonb("thumbnail").$type<ThumbnailSpec>(),
  thumbnailStatus: thumbnailStatusEnum("thumbnail_status").notNull().default("none"),
  thumbnailError: text("thumbnail_error"),
  ...timestamps,
});

export const scenes = pgTable(
  "scenes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    index: integer("index").notNull(),
    narration: text("narration").notNull(),
    visualPrompt: text("visual_prompt").notNull(),
    camera: text("camera").notNull().default(""),
    status: sceneStatusEnum("status").notNull().default("pending"),
    keyframePath: text("keyframe_path"),
    clipPath: text("clip_path"),
    error: text("error"),
    ...timestamps,
  },
  (t) => [uniqueIndex("scenes_project_index_uq").on(t.projectId, t.index)],
);

export const nichesRelations = relations(niches, ({ one, many }) => ({
  projects: many(projects),
  defaultCharacter: one(characters, {
    fields: [niches.defaultCharacterId],
    references: [characters.id],
  }),
}));

export const charactersRelations = relations(characters, ({ many }) => ({
  projects: many(projects),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  niche: one(niches, { fields: [projects.nicheId], references: [niches.id] }),
  character: one(characters, {
    fields: [projects.characterId],
    references: [characters.id],
  }),
  scenes: many(scenes),
}));

export const scenesRelations = relations(scenes, ({ one }) => ({
  project: one(projects, { fields: [scenes.projectId], references: [projects.id] }),
}));

export type Niche = typeof niches.$inferSelect;
export type Character = typeof characters.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Scene = typeof scenes.$inferSelect;
export type NicheFormat = (typeof nicheFormatEnum.enumValues)[number];
export type AspectRatio = (typeof aspectRatioEnum.enumValues)[number];
