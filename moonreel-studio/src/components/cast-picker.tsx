"use client";

import { useState } from "react";
import { useI18n } from "@/i18n/client";

export interface CastOption {
  id: string;
  name: string;
  imageUrl: string | null;
  /** The character has a ready reference image. */
  ready: boolean;
}

/**
 * Picks an ordered cast: each click adds a character to the end or takes it out, and the first
 * one is the lead. Posts the ids, comma-separated, under `name`.
 */
export function CastPicker({
  name,
  options,
  defaultIds,
}: {
  name: string;
  options: CastOption[];
  defaultIds: string[];
}) {
  const { t } = useI18n();
  const p = t.newProject;
  const [picked, setPicked] = useState(() => defaultIds.filter((id) => options.some((o) => o.id === id)));
  const toggle = (id: string) => setPicked((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
      <input type="hidden" name={name} value={picked.join(",")} />
      {options.map((c) => {
        const order = picked.indexOf(c.id);
        const on = order !== -1;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => toggle(c.id)}
            aria-pressed={on}
            title={c.ready ? c.name : p.noReference}
            className="group flex flex-col gap-2 text-left"
          >
            <span
              className={`relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl frost transition group-hover:bg-[rgb(255_240_214/0.07)] ${on ? "shadow-[inset_0_0_0_1px_rgb(214_183_131/0.6),0_0_24px_-6px_rgb(214_183_131/0.7)]" : ""}`}
            >
              {c.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.imageUrl} alt={c.name} className="size-full object-cover" />
              ) : (
                <span className="text-gold text-2xl font-bold">{c.name.slice(0, 1)}</span>
              )}
              {on && (
                <span className="bg-gold absolute top-1.5 left-1.5 flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-[#21180a]">
                  {order === 0 ? `1 · ${p.lead}` : order + 1}
                </span>
              )}
            </span>
            <span className={`truncate text-center text-xs ${on ? "text-gold-light" : "text-muted"}`}>
              {c.name}
              {!c.ready && <span className="block text-[10px] text-warning/80">{p.noReferenceShort}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
