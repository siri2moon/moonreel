import { asc } from "drizzle-orm";
import { Plus, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { db } from "@/db";
import { characters } from "@/db/schema";
import { StatusBadge } from "@/components/status-badge";
import { Empty, LinkButton, Loading, PageHeader } from "@/components/ui";
import { getDictionary } from "@/i18n/server";
import { fileUrl } from "@/lib/storage";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).characters.metaTitle };
}

export default async function CharactersPage() {
  const t = await getDictionary();
  return (
    <>
      <PageHeader
        eyebrow={t.characters.eyebrow}
        title={
          <>
            {t.characters.title.pre}
            <span className="text-gold">{t.characters.title.accent}</span>
            {t.characters.title.post}
          </>
        }
        description={t.characters.description}
        actions={
          <LinkButton href="/characters/new">
            <Plus /> {t.characters.new}
          </LinkButton>
        }
      />
      <Suspense fallback={<Loading />}>
        <CharacterList />
      </Suspense>
    </>
  );
}

async function CharacterList() {
  const [rows, t] = await Promise.all([
    db.select().from(characters).orderBy(asc(characters.name)),
    getDictionary(),
  ]);
  if (rows.length === 0) {
    return (
      <Empty icon={<Users />} title={t.characters.emptyTitle}>
        <p>{t.characters.emptyBody}</p>
        <LinkButton href="/characters/new" className="mt-5">
          <Plus /> {t.characters.create}
        </LinkButton>
      </Empty>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">
      {rows.map((c) => {
        const img = fileUrl(c.referenceImagePath, c.updatedAt);
        return (
          <Link
            key={c.id}
            href={`/characters/${c.id}`}
            className="glass group relative overflow-hidden rounded-3xl transition duration-300 hover:-translate-y-1 glass-hover"
          >
            <div className="flex aspect-[3/4] items-center justify-center overflow-hidden bg-gradient-to-b from-gold/10 to-black">
              {img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={img}
                  alt={c.name}
                  className="size-full object-cover transition duration-500 group-hover:scale-105"
                />
              ) : (
                <span className="text-gold text-6xl font-extrabold">{c.name.slice(0, 1)}</span>
              )}
            </div>
            <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 bg-gradient-to-t from-black via-black/80 to-transparent p-4 pt-12">
              <span className="truncate font-semibold">{c.name}</span>
              <span>
                <StatusBadge status={c.referenceStatus} />
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
