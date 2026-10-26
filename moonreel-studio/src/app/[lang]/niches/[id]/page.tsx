import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { db } from "@/db";
import { characters, niches } from "@/db/schema";
import { Loading, PageHeader } from "@/components/ui";
import { getDictionary } from "@/i18n/server";
import { NicheForm } from "../niche-form";

export default function EditNichePage(props: PageProps<"/[lang]/niches/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <EditNiche params={props.params} />
    </Suspense>
  );
}

async function EditNiche({ params }: { params: PageProps<"/[lang]/niches/[id]">["params"] }) {
  const { id } = await params;
  const [niche, characterRows, t] = await Promise.all([
    db.query.niches.findFirst({ where: eq(niches.id, id) }),
    db.select({ id: characters.id, name: characters.name }).from(characters).orderBy(asc(characters.name)),
    getDictionary(),
  ]);
  if (!niche) notFound();
  return (
    <>
      <PageHeader
        eyebrow={t.niches.editEyebrow}
        title={
          <span className="flex items-center gap-3">
            <span>{niche.icon}</span>
            <span className="text-gold">{niche.name}</span>
          </span>
        }
        description={t.niches.editDescription}
      />
      <NicheForm niche={niche} characters={characterRows} />
    </>
  );
}
