import { ArrowLeftRight, Settings2 } from "lucide-react";
import Link from "next/link";
import { getActiveNiche } from "@/lib/active-niche";

export async function NicheSwitcher({ compact = false }: { compact?: boolean }) {
  const niche = await getActiveNiche();

  if (!niche) {
    return (
      <Link
        href="/niches"
        className="gold-ring flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-gold-light transition hover:bg-gold/5"
      >
        <ArrowLeftRight className="size-4" />
        Chọn ngách để bắt đầu
      </Link>
    );
  }

  if (compact) {
    return (
      <Link
        href="/niches"
        className="flex items-center gap-2 rounded-xl frost px-2.5 py-1.5 text-xs"
        title="Đổi ngách"
      >
        <span className="text-base leading-none">{niche.icon}</span>
        <span className="max-w-28 truncate font-medium">{niche.name}</span>
        <ArrowLeftRight className="size-3.5 text-gold" />
      </Link>
    );
  }

  return (
    <div className="gold-ring rounded-2xl bg-gradient-to-br from-gold/[0.09] via-transparent to-transparent p-3">
      <div className="text-[10px] font-semibold tracking-[0.2em] text-subtle uppercase">Ngách đang dùng</div>
      <div className="mt-2 flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl frost shadow-[inset_0_0_0_1px_rgb(214_183_131/0.3)] text-xl">
          {niche.icon}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{niche.name}</div>
          <div className="text-xs text-muted">
            {niche.sceneCount} cảnh × {niche.sceneSeconds}s · {niche.defaultAspectRatio}
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        <Link
          href="/niches"
          className="flex items-center justify-center gap-1.5 rounded-lg frost py-1.5 text-xs font-medium text-foreground/90 transition hover:bg-gold/15 hover:text-gold-light"
        >
          <ArrowLeftRight className="size-3.5" /> Đổi ngách
        </Link>
        <Link
          href={`/niches/${niche.id}`}
          className="flex items-center justify-center gap-1.5 rounded-lg frost py-1.5 text-xs font-medium text-foreground/90 transition hover:bg-gold/15 hover:text-gold-light"
        >
          <Settings2 className="size-3.5" /> Cấu hình
        </Link>
      </div>
    </div>
  );
}
