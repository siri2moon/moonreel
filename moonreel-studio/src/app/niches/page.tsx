import type { Metadata } from "next";
import { Suspense } from "react";
import { NichePicker } from "@/components/niche-picker";
import { Loading } from "@/components/ui";

export const metadata: Metadata = { title: "Ngách" };

export default function NichesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <NichePicker />
    </Suspense>
  );
}
