import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { db } from "@/db";
import { characters } from "@/db/schema";
import { Loading, PageHeader } from "@/components/ui";
import { fileUrl } from "@/lib/storage";
import { getDictionary } from "@/i18n/server";
import { CharacterForm } from "../character-form";

export default function EditCharacterPage(props: PageProps<"/[lang]/characters/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <EditCharacter params={props.params} />
    </Suspense>
  );
}

async function EditCharacter({ params }: { params: PageProps<"/[lang]/characters/[id]">["params"] }) {
  const { id } = await params;
  const [c, t] = await Promise.all([
    db.query.characters.findFirst({ where: eq(characters.id, id) }),
    getDictionary(),
  ]);
  if (!c) notFound();
  return (
    <>
      <PageHeader eyebrow={t.characters.newEyebrow} title={<span className="text-gold">{c.name}</span>} />
      <CharacterForm
        character={{
          id: c.id,
          name: c.name,
          appearance: c.appearance,
          personality: c.personality,
          referenceStatus: c.referenceStatus,
          referenceError: c.referenceError,
          referenceUrl: fileUrl(c.referenceImagePath, c.updatedAt),
        }}
      />
    </>
  );
}
