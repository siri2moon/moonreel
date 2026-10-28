"use client";

import { useState } from "react";
import { inputClass } from "@/components/ui";
import { useI18n } from "@/i18n/client";

/** How many scenes this video gets, with the length it adds up to. Posts the number under `name`. */
export function SceneCountField({
  name,
  defaultCount,
  sceneSeconds,
  max,
}: {
  name: string;
  defaultCount: number;
  sceneSeconds: number;
  max: number;
}) {
  const { t } = useI18n();
  const p = t.newProject;
  const [count, setCount] = useState(String(defaultCount));
  const n = Number(count);
  const seconds = Number.isInteger(n) && n > 0 ? n * sceneSeconds : 0;
  const length = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <input
          type="number"
          name={name}
          min={1}
          max={max}
          required
          value={count}
          onChange={(e) => setCount(e.target.value)}
          className={`${inputClass} w-28`}
        />
        <span className="text-sm text-muted">{seconds ? p.sceneCountLength(length, sceneSeconds) : null}</span>
      </div>
      <p className="text-xs text-subtle">{p.sceneCountHint(defaultCount)}</p>
    </div>
  );
}
