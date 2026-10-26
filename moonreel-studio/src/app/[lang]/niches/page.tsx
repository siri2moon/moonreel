import type { Metadata } from "next";
import { Suspense } from "react";
import { NichePicker } from "@/components/niche-picker";
import { Loading } from "@/components/ui";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).niches.metaTitle };
}

export default function NichesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <NichePicker />
    </Suspense>
  );
}
