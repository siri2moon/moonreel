import { notInArray } from "drizzle-orm";
import { db, pool } from "@/db";
import { niches } from "@/db/schema";
import { DEFAULT_NICHE_SLUGS } from "./default-niches";
import { nichesDir, writeNicheFile } from "./private-niches";

// Saves every niche you created in the app (all but the sample ones) as a private niche file,
// so a fresh database can get them back with `pnpm db:seed`. Default characters are left out:
// their ids only exist in this database.
async function main() {
  const own = await db.select().from(niches).where(notInArray(niches.slug, [...DEFAULT_NICHE_SLUGS]));
  const files = await Promise.all(own.map(writeNicheFile));
  for (const f of files) console.log(`wrote ${f}`);
  console.log(`Exported ${files.length} niche(s) to ${nichesDir()}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
