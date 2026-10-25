import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import { Suspense } from "react";
import { db } from "@/db";
import { characters } from "@/db/schema";
import { Loading, PageHeader } from "@/components/ui";
import { NicheForm } from "../niche-form";

export const metadata: Metadata = { title: "Ngách mới" };

export default function NewNichePage() {
  return (
    <>
      <PageHeader
        eyebrow="Ngách"
        title="Tạo ngách mới"
        description="Một ngách là bộ quy tắc cho cả kênh: Muse viết kịch bản, chọn hình ảnh và nhịp video theo đúng cấu hình này."
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
