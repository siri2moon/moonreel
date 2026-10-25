import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { CharacterForm } from "../character-form";

export const metadata: Metadata = { title: "Nhân vật mới" };

export default function NewCharacterPage() {
  return (
    <>
      <PageHeader
        eyebrow="Nhân vật"
        title="Tạo nhân vật mới"
        description="Mô tả ngoại hình càng chi tiết, nhân vật càng nhất quán giữa các cảnh."
      />
      <CharacterForm />
    </>
  );
}
