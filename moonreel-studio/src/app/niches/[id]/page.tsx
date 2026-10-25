import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { db } from "@/db";
import { characters, niches } from "@/db/schema";
import { Loading, PageHeader } from "@/components/ui";
import { NicheForm } from "../niche-form";

export default function EditNichePage(props: PageProps<"/niches/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <EditNiche params={props.params} />
    </Suspense>
  );
}

async function EditNiche({ params }: { params: PageProps<"/niches/[id]">["params"] }) {
  const { id } = await params;
  const [niche, characterRows] = await Promise.all([
    db.query.niches.findFirst({ where: eq(niches.id, id) }),
    db.select({ id: characters.id, name: characters.name }).from(characters).orderBy(asc(characters.name)),
  ]);
  if (!niche) notFound();
  return (
    <>
      <PageHeader
        eyebrow="Cấu hình ngách"
        title={
          <span className="flex items-center gap-3">
            <span>{niche.icon}</span>
            <span className="text-gold">{niche.name}</span>
          </span>
        }
        description="Thay đổi áp dụng cho các video tạo sau. Video đã có kịch bản giữ nguyên."
      />
      <NicheForm niche={niche} characters={characterRows} />
    </>
  );
}
