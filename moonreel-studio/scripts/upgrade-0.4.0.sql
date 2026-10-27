-- Upgrade a 0.3.x database to 0.4.0. Run it once BEFORE `pnpm db:push`:
--
--   psql "$DATABASE_URL" -f scripts/upgrade-0.4.0.sql
--
-- 0.4.0 replaces projects.character_id and niches.default_character_id with ordered cast
-- tables. `db:push` would drop the old columns, so this creates the new tables first (exactly as
-- the schema defines them, so push leaves them alone) and copies each character across.
-- Safe to run twice.

BEGIN;

CREATE TABLE IF NOT EXISTS project_characters (
  project_id uuid NOT NULL,
  character_id uuid NOT NULL,
  "position" integer NOT NULL,
  CONSTRAINT project_characters_project_id_character_id_pk PRIMARY KEY (project_id, character_id),
  CONSTRAINT project_characters_project_id_projects_id_fk FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT project_characters_character_id_characters_id_fk FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS niche_characters (
  niche_id uuid NOT NULL,
  character_id uuid NOT NULL,
  "position" integer NOT NULL,
  CONSTRAINT niche_characters_niche_id_character_id_pk PRIMARY KEY (niche_id, character_id),
  CONSTRAINT niche_characters_niche_id_niches_id_fk FOREIGN KEY (niche_id) REFERENCES niches(id) ON DELETE CASCADE,
  CONSTRAINT niche_characters_character_id_characters_id_fk FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'character_id') THEN
    INSERT INTO project_characters (project_id, character_id, "position")
    SELECT id, character_id, 0 FROM projects WHERE character_id IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'niches' AND column_name = 'default_character_id') THEN
    INSERT INTO niche_characters (niche_id, character_id, "position")
    SELECT id, default_character_id, 0 FROM niches WHERE default_character_id IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

COMMIT;
