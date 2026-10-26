import { db, pool } from "@/db";
import { niches } from "@/db/schema";
import { DEFAULT_NICHES } from "./default-niches";
import { nichesDir, readPrivateNiches } from "./private-niches";

async function main() {
  const own = await readPrivateNiches();
  // Single multi-row insert; existing slugs are left untouched.
  const inserted = await db
    .insert(niches)
    .values([...DEFAULT_NICHES, ...own])
    .onConflictDoNothing({ target: niches.slug })
    .returning({ slug: niches.slug });
  console.log(`Seeded ${inserted.length} niche(s); ${own.length} private niche file(s) in ${nichesDir()}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
