import type { Metadata } from "next";
import { Suspense } from "react";
import { getCastOptions } from "@/lib/views";
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
  return <NicheForm characters={await getCastOptions()} defaultCastIds={[]} />;
}
