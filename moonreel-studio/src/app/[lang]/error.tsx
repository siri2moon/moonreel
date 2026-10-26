"use client";

import { CircleAlert, RotateCcw } from "lucide-react";
import { Button, Empty } from "@/components/ui";
import { useI18n } from "@/i18n/client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  return (
    <Empty icon={<CircleAlert />} title={t.errors.title}>
      <p className="text-danger">{error.message}</p>
      <Button className="mt-5" onClick={reset}>
        <RotateCcw /> {t.errors.retry}
      </Button>
    </Empty>
  );
}
