"use client";

import { CircleAlert, RotateCcw } from "lucide-react";
import { Button, Empty } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Empty icon={<CircleAlert />} title="Có lỗi xảy ra">
      <p className="text-danger">{error.message}</p>
      <Button className="mt-5" onClick={reset}>
        <RotateCcw /> Thử lại
      </Button>
    </Empty>
  );
}
