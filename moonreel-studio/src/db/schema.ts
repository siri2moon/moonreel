import { relations } from "drizzle-orm";
import {
  type AnyPgColumn,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const aspectRatioEnum = pgEnum("aspect_ratio", ["9:16", "16:9"]);

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
  defaultAspectRatio: aspectRatioEnum("default_aspect_ratio").notNull().default("9:16"),
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
export type AspectRatio = (typeof aspectRatioEnum.enumValues)[number];
