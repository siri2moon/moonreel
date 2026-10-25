import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { z } from "zod";
import { db } from "@/db";
import { niches } from "@/db/schema";

/** The niche the whole workspace is scoped to, remembered per browser. */
export const NICHE_COOKIE = "moonreel_niche";

/** Deduplicated per request: the sidebar and the page both ask for it. */
export const getActiveNiche = cache(async () => {
  const raw = (await cookies()).get(NICHE_COOKIE)?.value;
  const id = z.uuid().safeParse(raw);
  if (!id.success) return null;
  return (await db.query.niches.findFirst({ where: eq(niches.id, id.data) })) ?? null;
});
