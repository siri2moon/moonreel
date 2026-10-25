import { asc } from "drizzle-orm";
import { Plus, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { db } from "@/db";
import { characters } from "@/db/schema";
import { Empty, LinkButton, Loading, PageHeader, StatusBadge } from "@/components/ui";
import { fileUrl } from "@/lib/storage";

export const metadata: Metadata = { title: "Nhân vật" };

export default function CharactersPage() {
  return (
    <>
      <PageHeader
        eyebrow="Thư viện"
        title={
          <>
            Nhân <span className="text-gold">vật</span>
          </>
        }
        description="Nhân vật là gương mặt của kênh. Ảnh tham chiếu giúp Muse giữ đúng ngoại hình qua mọi cảnh và mọi video."
        actions={
          <LinkButton href="/characters/new">
            <Plus /> Nhân vật mới
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
  const rows = await db.select().from(characters).orderBy(asc(characters.name));
  if (rows.length === 0) {
    return (
      <Empty icon={<Users />} title="Chưa có nhân vật">
        <p>Tạo một nhân vật để mọi video trong kênh có cùng một gương mặt quen thuộc.</p>
        <LinkButton href="/characters/new" className="mt-5">
          <Plus /> Tạo nhân vật
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
