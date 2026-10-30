import { relations, sql } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
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
 * "wordless": a story told by pictures alone (visual parables for Reels and Shorts); scenes
 * carry a shot note, nothing is spoken and there are no subtitles.
 */
export const nicheFormatEnum = pgEnum("niche_format", ["story", "ambient", "wordless"]);

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

/** Render state of one Short. */
export const shortStatusEnum = pgEnum("short_status", ["rendering", "ready", "failed"]);

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
  /** The channel's own title and thumbnail rules; they win over the general ones in the captions prompt. */
  postsInstructions: text("posts_instructions").notNull().default(""),
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
  aspectRatio: aspectRatioEnum("aspect_ratio").notNull(),
  status: projectStatusEnum("status").notNull().default("scripting"),
  error: text("error"),
  finalVideoPath: text("final_video_path"),
  captionsPath: text("captions_path"),
  /** Uploaded soundtrack of an ambient video; the clips loop until it ends. */
  audioPath: text("audio_path"),
  /** Length of the soundtrack, which is also the length of the final ambient video. */
  audioSeconds: real("audio_seconds"),
  /** Scenes in this video's script; null uses the niche's count. */
  sceneCount: integer("scene_count"),
  /** Optional photo of the place; Muse copies it when drawing keyframes and the thumbnail. */
  referenceImagePath: text("reference_image_path"),
  posts: jsonb("posts").$type<SocialPosts>(),
  postsStatus: postsStatusEnum("posts_status").notNull().default("none"),
  postsError: text("posts_error"),
  thumbnail: jsonb("thumbnail").$type<ThumbnailSpec>(),
  thumbnailStatus: thumbnailStatusEnum("thumbnail_status").notNull().default("none"),
  thumbnailError: text("thumbnail_error"),
  /** "writing" while the AI picks the moments for the Shorts; each Short then renders on its own. */
  shortsStatus: postsStatusEnum("shorts_status").notNull().default("none"),
  shortsError: text("shorts_error"),
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
    /**
     * The shot carries on from the previous one: its first frame is the previous clip's last
     * frame, so no keyframe is drawn (one Muse call fewer). Never set on scene 1.
     */
    continuesPrevious: boolean("continues_previous").notNull().default(false),
    /** Cast members on screen in this shot, from the project's cast; empty means none. */
    characterIds: uuid("character_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    error: text("error"),
    ...timestamps,
  },
  (t) => [uniqueIndex("scenes_project_index_uq").on(t.projectId, t.index)],
);

/** A vertical Short cut from a project's final video: scenes `fromScene`..`toScene` (0-based, inclusive). */
export const shorts = pgTable(
  "shorts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    index: integer("index").notNull(),
    fromScene: integer("from_scene").notNull(),
    toScene: integer("to_scene").notNull(),
    /** On-screen hook; words wrapped in *stars* are drawn in the niche's accent colour. */
    hook: text("hook").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: shortStatusEnum("status").notNull().default("rendering"),
    videoPath: text("video_path"),
    error: text("error"),
    ...timestamps,
  },
  (t) => [uniqueIndex("shorts_project_index_uq").on(t.projectId, t.index)],
);

/** A project's recurring cast, in order: position 0 is the lead. */
export const projectCharacters = pgTable(
  "project_characters",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.characterId] })],
);

/** The cast preselected for a new video in a niche, in the same order. */
export const nicheCharacters = pgTable(
  "niche_characters",
  {
    nicheId: uuid("niche_id")
      .notNull()
      .references(() => niches.id, { onDelete: "cascade" }),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
  },
  (t) => [primaryKey({ columns: [t.nicheId, t.characterId] })],
);

export const nichesRelations = relations(niches, ({ many }) => ({
  projects: many(projects),
  defaultCast: many(nicheCharacters),
}));

export const charactersRelations = relations(characters, ({ many }) => ({
  projects: many(projectCharacters),
  niches: many(nicheCharacters),
}));

export const projectCharactersRelations = relations(projectCharacters, ({ one }) => ({
  project: one(projects, { fields: [projectCharacters.projectId], references: [projects.id] }),
  character: one(characters, { fields: [projectCharacters.characterId], references: [characters.id] }),
}));

export const nicheCharactersRelations = relations(nicheCharacters, ({ one }) => ({
  niche: one(niches, { fields: [nicheCharacters.nicheId], references: [niches.id] }),
  character: one(characters, { fields: [nicheCharacters.characterId], references: [characters.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  niche: one(niches, { fields: [projects.nicheId], references: [niches.id] }),
  cast: many(projectCharacters),
  scenes: many(scenes),
  shorts: many(shorts),
}));

export const shortsRelations = relations(shorts, ({ one }) => ({
  project: one(projects, { fields: [shorts.projectId], references: [projects.id] }),
}));

export const scenesRelations = relations(scenes, ({ one }) => ({
  project: one(projects, { fields: [scenes.projectId], references: [projects.id] }),
}));

export type Niche = typeof niches.$inferSelect;
export type Character = typeof characters.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Scene = typeof scenes.$inferSelect;
export type Short = typeof shorts.$inferSelect;
export type NicheFormat = (typeof nicheFormatEnum.enumValues)[number];
export type AspectRatio = (typeof aspectRatioEnum.enumValues)[number];
