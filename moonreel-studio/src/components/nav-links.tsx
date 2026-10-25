"use client";

import { Compass, LayoutDashboard, Plus, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

const items = [
  { href: "/", label: "Tổng quan", icon: LayoutDashboard, match: (p: string) => p === "/" || (p.startsWith("/projects/") && p !== "/projects/new") },
  { href: "/projects/new", label: "Tạo video", icon: Plus, match: (p: string) => p === "/projects/new" },
  { href: "/characters", label: "Nhân vật", icon: Users, match: (p: string) => p.startsWith("/characters") },
  { href: "/niches", label: "Ngách", icon: Compass, match: (p: string) => p.startsWith("/niches") },
];

type Orientation = "vertical" | "horizontal";

// usePathname is request data under Cache Components, so it streams in behind Suspense;
// the fallback is the same menu without an active item.
export function NavLinks({ orientation = "vertical" }: { orientation?: Orientation }) {
  return (
    <Suspense fallback={<NavList pathname={null} orientation={orientation} />}>
      <ActiveNav orientation={orientation} />
    </Suspense>
  );
}

function ActiveNav({ orientation }: { orientation: Orientation }) {
  return <NavList pathname={usePathname()} orientation={orientation} />;
}

function NavList({ pathname, orientation }: { pathname: string | null; orientation: Orientation }) {
  const vertical = orientation === "vertical";

  return (
    <nav className={vertical ? "flex flex-col gap-1" : "flex gap-1 overflow-x-auto"}>
      {items.map(({ href, label, icon: Icon, match }) => {
        const active = pathname !== null && match(pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`group relative flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              active
                ? "bg-gradient-to-r from-gold/15 to-transparent text-gold-light"
                : "text-muted hover:bg-[rgb(255_240_214/0.05)] hover:text-foreground"
            }`}
          >
            {active && vertical && (
              <span className="bg-gold absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full" />
            )}
            <Icon className={`size-[18px] ${active ? "text-gold" : "text-subtle group-hover:text-muted"}`} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
