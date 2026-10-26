import { asc, count, eq, getTableColumns } from "drizzle-orm";
import { Check, Clapperboard, Clock, Languages, Plus, Settings2, Smartphone, Monitor } from "lucide-react";
import Link from "next/link";
import { selectNiche } from "@/app/actions";
import { db } from "@/db";
import { niches, projects } from "@/db/schema";
import { getDictionary } from "@/i18n/server";
import { getActiveNiche } from "@/lib/active-niche";
import { Button, Chip, Empty, Eyebrow, LinkButton } from "./ui";

export async function NichePicker({ welcome = false }: { welcome?: boolean }) {
  // One grouped query gives every niche with its video count.
  const [rows, active, t] = await Promise.all([
    db
      .select({ ...getTableColumns(niches), videos: count(projects.id) })
      .from(niches)
      .leftJoin(projects, eq(projects.nicheId, niches.id))
      .groupBy(niches.id)
      .orderBy(asc(niches.name)),
    getActiveNiche(),
    getDictionary(),
  ]);
  const heading = welcome ? t.picker.titleWelcome : t.picker.title;

  return (
    <div className="flex flex-col gap-10">
      <header className="relative flex flex-col items-center gap-4 pt-4 text-center md:pt-10">
        <Eyebrow>{welcome ? t.picker.eyebrowWelcome : t.picker.eyebrow}</Eyebrow>
        <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight md:text-5xl">
          {heading.pre}
          <span className="text-gold">{heading.accent}</span>
          {heading.post}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted md:text-base">
          {t.picker.intro}
        </p>
      </header>

      {rows.length === 0 ? (
        <Empty icon={<Clapperboard />} title={t.picker.emptyTitle}>
          <p>
            {t.picker.emptyBefore}
            <code className="text-gold-light">pnpm db:seed</code>
            {t.picker.emptyAfter}
          </p>
          <LinkButton href="/niches/new" className="mt-4">
            <Plus /> {t.picker.create}
          </LinkButton>
        </Empty>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((n) => {
            const isActive = active?.id === n.id;
            return (
              <article
                key={n.id}
                className={`glass group relative flex flex-col overflow-hidden rounded-3xl p-6 transition duration-300 hover:-translate-y-1 glass-hover ${
                  isActive ? "gold-ring glow-gold" : ""
                }`}
              >
                <div className="pointer-events-none absolute -top-20 -right-20 size-48 rounded-full bg-gold/10 opacity-0 blur-3xl transition duration-500 group-hover:opacity-100" />

                <div className="flex items-start justify-between gap-3">
                  <span className="flex size-14 items-center justify-center rounded-2xl border border-gold/20 bg-gradient-to-br from-gold/15 to-black/40 text-3xl">
                    {n.icon}
                  </span>
                  <div className="flex items-center gap-1">
                    {isActive && (
                      <span className="flex items-center gap-1 rounded-full bg-gold/15 px-2.5 py-1 text-[11px] font-semibold text-gold-light">
                        <Check className="size-3" /> {t.picker.inUse}
                      </span>
                    )}
                    <Link
                      href={`/niches/${n.id}`}
                      title={t.picker.settings}
                      className="flex size-8 items-center justify-center rounded-lg text-subtle transition hover:bg-[rgb(255_240_214/0.06)] hover:text-gold-light"
                    >
                      <Settings2 className="size-4" />
                    </Link>
                  </div>
                </div>

                <h2 className="mt-5 text-xl font-bold tracking-tight">{n.name}</h2>
                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted">{n.description || "—"}</p>

                <div className="mt-5 flex flex-wrap gap-2">
                  <Chip icon={<Clock />}>
                    {n.sceneCount} × {n.sceneSeconds}s
                  </Chip>
                  <Chip icon={n.defaultAspectRatio === "9:16" ? <Smartphone /> : <Monitor />}>
                    {n.defaultAspectRatio}
                  </Chip>
                  <Chip icon={<Languages />}>{n.language}</Chip>
                </div>

                {n.tone && (
                  <p className="mt-4 border-l-2 border-gold/30 pl-3 text-xs leading-relaxed text-subtle italic">
                    “{n.tone}”
                  </p>
                )}

                <div className="mt-6 flex items-center justify-between gap-3 pt-2">
                  <span className="text-xs text-subtle">{t.picker.videos(n.videos)}</span>
                  <form action={selectNiche.bind(null, n.id)}>
                    <Button type="submit" variant={isActive ? "secondary" : "primary"} size="md">
                      {isActive ? t.picker.enter : t.picker.use}
                    </Button>
                  </form>
                </div>
              </article>
            );
          })}

          <Link
            href="/niches/new"
            className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-[rgb(255_232_196/0.16)] p-6 text-center text-muted transition hover:bg-[rgb(255_240_214/0.07)] hover:bg-gold/[0.03] hover:text-gold-light"
          >
            <span className="flex size-12 items-center justify-center rounded-2xl frost">
              <Plus className="size-5" />
            </span>
            <span className="font-semibold">{t.picker.newTitle}</span>
            <span className="max-w-60 text-xs text-subtle">{t.picker.newBody}</span>
          </Link>
        </div>
      )}
    </div>
  );
}
