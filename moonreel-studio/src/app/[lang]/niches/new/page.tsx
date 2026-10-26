import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import { Suspense } from "react";
import { db } from "@/db";
import { characters } from "@/db/schema";
import { Loading, PageHeader } from "@/components/ui";
import { getDictionary } from "@/i18n/server";
import { NicheForm } from "../niche-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).niches.newMetaTitle };
}

export default async function NewNichePage() {
  const t = await getDictionary();
  return (
    <>
      <PageHeader
        eyebrow={t.niches.eyebrow}
        title={t.niches.newTitle}
        description={t.niches.newDescription}
      />
      <Suspense fallback={<Loading />}>
        <NewNiche />
      </Suspense>
    </>
  );
}

async function NewNiche() {
  const rows = await db
    .select({ id: characters.id, name: characters.name })
    .from(characters)
    .orderBy(asc(characters.name));
  return <NicheForm characters={rows} />;
}
