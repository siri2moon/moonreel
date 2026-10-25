import { desc, eq, sql } from "drizzle-orm";
import {
  CheckCheck,
  Clapperboard,
  Clock,
  Film,
  Languages,
  Loader,
  Monitor,
  Palette,
  Plus,
  ScrollText,
  Settings2,
  Smartphone,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { db } from "@/db";
import { projects, scenes, type Niche } from "@/db/schema";
import { NichePicker } from "@/components/niche-picker";
import { Chip, Empty, Eyebrow, LinkButton, Loading, SectionTitle, Stat, StatusBadge } from "@/components/ui";
import { getActiveNiche } from "@/lib/active-niche";
import { fileUrl } from "@/lib/storage";

export default function HomePage() {
  return (
    <Suspense fallback={<Loading />}>
      <Home />
    </Suspense>
  );
}

async function Home() {
  const niche = await getActiveNiche();
  if (!niche) return <NichePicker welcome />;
  return <Dashboard niche={niche} />;
}

async function Dashboard({ niche }: { niche: Niche }) {
  const [[stats], rows] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        done: sql<number>`count(*) filter (where ${projects.status} = 'done')::int`,
        working: sql<number>`count(*) filter (where ${projects.status} in ('scripting','producing','rendering'))::int`,
        review: sql<number>`count(*) filter (where ${projects.status} = 'script_ready')::int`,
      })
      .from(projects)
      .where(eq(projects.nicheId, niche.id)),
    db.query.projects.findMany({
      where: eq(projects.nicheId, niche.id),
      orderBy: [desc(projects.createdAt)],
      limit: 60,
      with: {
        character: { columns: { name: true } },
        // Only the opening scene, as the card thumbnail.
        scenes: {
          columns: { keyframePath: true, updatedAt: true },
          where: eq(scenes.index, 0),
          limit: 1,
        },
      },
    }),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <NicheHero niche={niche} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Tổng video" value={stats?.total ?? 0} icon={<Film />} />
        <Stat label="Hoàn thành" value={stats?.done ?? 0} icon={<CheckCheck />} />
        <Stat label="Đang chạy" value={stats?.working ?? 0} icon={<Loader />} />
        <Stat label="Chờ duyệt" value={stats?.review ?? 0} icon={<ScrollText />} />
      </div>

      <section>
        <SectionTitle
          aside={
            rows.length > 0 && (
              <LinkButton href="/projects/new" variant="secondary" size="sm">
                <Plus /> Video mới
              </LinkButton>
            )
          }
        >
          Video của ngách
        </SectionTitle>

        {rows.length === 0 ? (
          <Empty icon={<Clapperboard />} title="Chưa có video nào trong ngách này">
            <p>Nhập một chủ đề, Muse sẽ viết kịch bản theo đúng cấu hình của ngách.</p>
            <LinkButton href="/projects/new" className="mt-5">
              <Plus /> Tạo video đầu tiên
            </LinkButton>
          </Empty>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((p) => {
              const opening = p.scenes[0];
              const thumb = fileUrl(opening?.keyframePath ?? null, opening?.updatedAt);
              return (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className="glass group flex flex-col overflow-hidden rounded-2xl transition duration-300 hover:-translate-y-0.5 glass-hover"
                >
                  <div className="relative aspect-video overflow-hidden bg-black">
                    {thumb ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={thumb} alt="" className="absolute inset-0 size-full scale-110 object-cover opacity-40 blur-xl" />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={thumb}
                          alt=""
                          className="relative mx-auto h-full object-contain transition duration-500 group-hover:scale-[1.03]"
                        />
                      </>
                    ) : (
                      <div className="flex size-full items-center justify-center bg-gradient-to-br from-gold/10 via-transparent to-transparent text-4xl">
                        {niche.icon}
                      </div>
                    )}
                    <div className="absolute top-3 left-3 flex gap-1.5">
                      <span className="rounded-md bg-black/70 px-2 py-0.5 font-mono text-[11px] text-foreground/90 backdrop-blur">
                        {p.aspectRatio}
                      </span>
                    </div>
                    <div className="absolute top-3 right-3">
                      <StatusBadge status={p.status} />
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <h3 className="line-clamp-2 font-semibold leading-snug transition group-hover:text-gold-light">
                      {p.title}
                    </h3>
                    <div className="mt-auto flex items-center gap-3 text-xs text-subtle">
                      {p.character && (
                        <span className="flex items-center gap-1">
                          <UserRound className="size-3.5" /> {p.character.name}
                        </span>
                      )}
                      <span>{p.createdAt.toLocaleDateString("vi-VN")}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function NicheHero({ niche }: { niche: Niche }) {
  return (
    <section className="glass gold-ring relative overflow-hidden rounded-[32px] p-6 md:p-10">
      {/* Warm light pooling from the top-left corner, behind the glass. */}
      <div className="pointer-events-none absolute -top-32 -left-24 size-96 rounded-full bg-[radial-gradient(circle,rgb(255_226_168/0.18),transparent_65%)]" />
      <div className="pointer-events-none absolute -top-24 -right-16 size-80 rounded-full bg-gold/20 blur-[100px]" />
      <Planet />

      <div className="relative flex flex-col gap-5">
        <Eyebrow>Ngách đang dùng</Eyebrow>
        <div className="flex items-center gap-4">
          <span className="flex size-16 items-center justify-center rounded-2xl frost shadow-[inset_0_0_0_1px_rgb(214_183_131/0.3),0_0_40px_-10px_rgb(214_183_131/0.45)] text-4xl">
            {niche.icon}
          </span>
          <div>
            <h1 className="text-gold text-3xl font-extrabold tracking-tight md:text-4xl">{niche.name}</h1>
            {niche.description && <p className="mt-1 max-w-xl text-sm text-muted">{niche.description}</p>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Chip icon={<Clock />}>
            {niche.sceneCount} cảnh × {niche.sceneSeconds}s ≈ {niche.sceneCount * niche.sceneSeconds}s
          </Chip>
          <Chip icon={niche.defaultAspectRatio === "9:16" ? <Smartphone /> : <Monitor />}>
            Mặc định {niche.defaultAspectRatio}
          </Chip>
          <Chip icon={<Languages />}>{niche.language}</Chip>
          {niche.visualStyle && (
            <Chip icon={<Palette />}>
              <span className="max-w-64 truncate">{niche.visualStyle}</span>
            </Chip>
          )}
        </div>

        <div className="flex flex-wrap gap-3 pt-1">
          <LinkButton href="/projects/new" size="lg">
            <Plus /> Tạo video mới
          </LinkButton>
          <LinkButton href={`/niches/${niche.id}`} variant="secondary" size="lg">
            <Settings2 /> Cấu hình ngách
          </LinkButton>
        </div>
      </div>
    </section>
  );
}

/** Decorative gold planet with a ring, top-right of the hero. */
function Planet() {
  return (
    <div className="pointer-events-none absolute top-1/2 -right-6 hidden size-64 -translate-y-1/2 md:block">
      {/* Back half of the ring, drawn behind the sphere. */}
      <div className="absolute top-1/2 left-1/2 h-14 w-[135%] -translate-x-1/2 -translate-y-1/2 -rotate-[16deg] rounded-[50%] border border-gold-light/25 [clip-path:inset(0_0_50%_0)]" />
      <div className="absolute inset-8 rounded-full bg-[radial-gradient(circle_at_32%_28%,#fff8e4_0%,#f0d49a_18%,#c49a52_45%,#5c4220_78%,#1a1206_100%)] shadow-[0_0_90px_6px_rgb(214_183_131/0.28),inset_-18px_-22px_40px_rgb(0_0_0/0.55)]" />
      {/* Front half of the ring, crossing in front of the sphere. */}
      <div className="absolute top-1/2 left-1/2 h-14 w-[135%] -translate-x-1/2 -translate-y-1/2 -rotate-[16deg] rounded-[50%] border-[1.5px] border-gold-light/70 shadow-[0_0_14px_rgb(244_226_184/0.35)] [clip-path:inset(50%_0_0_0)]" />
    </div>
  );
}
