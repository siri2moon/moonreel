"use client";

import { useEffect, useState } from "react";

type Health = { ok: boolean; muse?: { accounts: number }; error?: string };

export function HealthBadge() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/health")
        .then((r) => r.json() as Promise<Health>)
        .then((h) => alive && setHealth(h))
        .catch(() => alive && setHealth({ ok: false, error: "unreachable" }));
    load();
    const timer = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const tone = !health ? "bg-subtle" : health.ok ? "bg-success" : "bg-danger";
  const label = !health ? "Đang kiểm tra…" : health.ok ? "Muse đã kết nối" : "Muse chưa kết nối";
  const detail = health?.ok ? `${health.muse?.accounts ?? 0} tài khoản` : health?.error;

  return (
    <div
      className="flex items-center gap-2.5 rounded-xl frost px-3 py-2"
      title={health?.error}
    >
      <span className="relative flex size-2">
        {health?.ok && <span className={`absolute inline-flex size-full animate-ping rounded-full opacity-60 ${tone}`} />}
        <span className={`relative inline-flex size-2 rounded-full ${tone}`} />
      </span>
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="text-xs font-medium">{label}</span>
        {detail && <span className="truncate text-[11px] text-subtle">{detail}</span>}
      </div>
    </div>
  );
}
