import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { db } from "@/db";
import { nicheCharacters, niches } from "@/db/schema";
import { getCastOptions } from "@/lib/views";
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
    db.query.niches.findFirst({
      where: eq(niches.id, id),
      with: {
        defaultCast: { orderBy: [asc(nicheCharacters.position)], columns: { characterId: true } },
        // The name only: the Page's access token stays on the server.
        facebookPage: { columns: { name: true, instagramUsername: true, instagramId: true } },
      },
    }),
    getCastOptions(),
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
      <NicheForm
        niche={niche}
        characters={characterRows}
        defaultCastIds={niche.defaultCast.map((c) => c.characterId)}
        facebookPageName={niche.facebookPage?.name ?? null}
        instagramAccount={
          niche.facebookPage?.instagramId
            ? `@${niche.facebookPage.instagramUsername ?? niche.facebookPage.instagramId}`
            : null
        }
      />
    </>
  );
}
