import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { getDictionary } from "@/i18n/server";
import { CharacterForm } from "../character-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).characters.newMetaTitle };
}

export default async function NewCharacterPage() {
  const t = await getDictionary();
  return (
    <>
      <PageHeader
        eyebrow={t.characters.newEyebrow}
        title={t.characters.newTitle}
        description={t.characters.newDescription}
      />
      <CharacterForm />
    </>
  );
}
