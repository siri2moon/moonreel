"use client";

import { useI18n } from "@/i18n/client";
import { Badge, type Tone } from "./ui";

const dotClass: Record<Tone, string> = {
  gold: "bg-gold",
  info: "bg-info",
  success: "bg-success",
  danger: "bg-danger",
  muted: "bg-subtle",
};

const statusMeta: Record<string, { tone: Tone; live?: boolean }> = {
  scripting: { tone: "gold", live: true },
  script_ready: { tone: "info" },
  producing: { tone: "gold", live: true },
  rendering: { tone: "gold", live: true },
  done: { tone: "success" },
  failed: { tone: "danger" },
  pending: { tone: "muted" },
  keyframe: { tone: "gold", live: true },
  video: { tone: "gold", live: true },
  generating: { tone: "gold", live: true },
  ready: { tone: "success" },
  none: { tone: "muted" },
};

/** Project, scene or character status, with a pulsing dot while work is in progress. */
export function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const meta = statusMeta[status] ?? { tone: "muted" as Tone };
  return (
    <Badge tone={meta.tone}>
      <span className="relative flex size-1.5">
        {meta.live && (
          <span className={`absolute inline-flex size-full animate-ping rounded-full opacity-75 ${dotClass[meta.tone]}`} />
        )}
        <span className={`relative inline-flex size-1.5 rounded-full ${dotClass[meta.tone]}`} />
      </span>
      {t.status[status] ?? status}
    </Badge>
  );
}
