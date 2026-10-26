"use client";

import { Orbit } from "lucide-react";
import { Empty, LinkButton } from "@/components/ui";
import { useI18n } from "@/i18n/client";

export default function NotFound() {
  const { t } = useI18n();
  return (
    <Empty icon={<Orbit />} title={t.errors.notFoundTitle}>
      <p>{t.errors.notFoundBody}</p>
      <LinkButton href="/" className="mt-5">
        {t.errors.backHome}
      </LinkButton>
    </Empty>
  );
}
