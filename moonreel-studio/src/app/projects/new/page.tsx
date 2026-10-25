import { asc } from "drizzle-orm";
import { Clock, Compass, Languages, Monitor, Palette, Smartphone, UserRoundX, WandSparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { createProject } from "@/app/actions";
import { db } from "@/db";
import { characters } from "@/db/schema";
import { Button, Card, Chip, Empty, Eyebrow, inputClass, LinkButton, Loading, PageHeader } from "@/components/ui";
import { getActiveNiche } from "@/lib/active-niche";
import { fileUrl } from "@/lib/storage";

export const metadata: Metadata = { title: "Tạo video" };

export default function NewProjectPage() {
  return (
    <Suspense fallback={<Loading />}>
      <NewProject />
    </Suspense>
  );
}

const FORMATS = [
  { value: "9:16", title: "Dọc 9:16", sub: "TikTok · Reels · Shorts", Icon: Smartphone, frame: "h-12 w-7" },
  { value: "16:9", title: "Ngang 16:9", sub: "YouTube", Icon: Monitor, frame: "h-7 w-12" },
] as const;

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="bg-gold flex size-7 items-center justify-center rounded-full text-xs font-bold text-[#21180a]">
          {n}
        </span>
        <h2 className="font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

async function NewProject() {
  const niche = await getActiveNiche();
  if (!niche) {
    return (
      <Empty icon={<Compass />} title="Chọn ngách trước đã">
        <p>Video mới luôn thuộc ngách đang dùng.</p>
        <LinkButton href="/niches" className="mt-5">
          Chọn ngách
        </LinkButton>
      </Empty>
    );
  }

  const characterRows = await db.select().from(characters).orderBy(asc(characters.name));
  const defaultCharacter = characterRows.some((c) => c.id === niche.defaultCharacterId)
    ? niche.defaultCharacterId
    : "";
  const sceneMinutes = `${niche.sceneCount * 2}–${niche.sceneCount * 4}`;

  return (
    <>
      <PageHeader
        eyebrow={`${niche.icon} ${niche.name}`}
        title={
          <>
            Tạo <span className="text-gold">video mới</span>
          </>
        }
        description="Nhập chủ đề, Muse viết kịch bản theo cấu hình ngách. Bạn sửa và duyệt trước khi sản xuất."
      />

      <form action={createProject} className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <input type="hidden" name="nicheId" value={niche.id} />

        <Card className="flex flex-col gap-10 p-6 md:p-8">
          <Step n={1} title="Chủ đề video">
            <textarea
              name="topic"
              required
              minLength={3}
              rows={4}
              autoFocus
              className={`${inputClass} text-base leading-relaxed`}
              placeholder="VD: 3 sai lầm khi dùng thẻ tín dụng khiến người trẻ mất tiền oan"
            />
            <p className="text-xs text-subtle">Càng cụ thể (con số, đối tượng, tình huống), kịch bản càng sát ý.</p>
          </Step>

          <Step n={2} title="Định dạng">
            <div className="grid grid-cols-2 gap-3">
              {FORMATS.map(({ value, title, sub, frame }) => (
                <label
                  key={value}
                  className="group flex cursor-pointer items-center gap-4 rounded-2xl frost p-4 transition hover:bg-[rgb(255_240_214/0.07)] has-checked:shadow-[inset_0_0_0_1px_rgb(214_183_131/0.6),0_0_30px_-10px_rgb(214_183_131/0.6)] has-checked:bg-gold/[0.07] has-checked:shadow-[0_0_30px_-10px_rgb(214_183_131/0.5)]"
                >
                  <input
                    type="radio"
                    name="aspectRatio"
                    value={value}
                    defaultChecked={niche.defaultAspectRatio === value}
                    className="peer sr-only"
                  />
                  <span className="flex size-14 shrink-0 items-center justify-center">
                    <span
                      className={`${frame} rounded-md border-2 border-subtle transition group-has-checked:shadow-[inset_0_0_0_1px_rgb(214_183_131/0.6),0_0_30px_-10px_rgb(214_183_131/0.6)] group-has-checked:bg-gold/15`}
                    />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{title}</span>
                    <span className="block text-xs text-subtle">{sub}</span>
                  </span>
                </label>
              ))}
            </div>
          </Step>

          <Step n={3} title="Nhân vật xuyên suốt">
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
              <CharacterOption value="" checked={defaultCharacter === ""} name="Không dùng">
                <UserRoundX className="size-7 text-subtle" />
              </CharacterOption>
              {characterRows.map((c) => {
                const img = fileUrl(c.referenceImagePath, c.updatedAt);
                return (
                  <CharacterOption
                    key={c.id}
                    value={c.id}
                    checked={defaultCharacter === c.id}
                    name={c.name}
                    warn={c.referenceStatus !== "ready"}
                  >
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img} alt={c.name} className="size-full object-cover" />
                    ) : (
                      <span className="text-gold text-2xl font-bold">{c.name.slice(0, 1)}</span>
                    )}
                  </CharacterOption>
                );
              })}
            </div>
            <p className="text-xs text-subtle">
              Nhân vật có ảnh tham chiếu giữ gương mặt nhất quán qua mọi cảnh.{" "}
              <Link href="/characters/new" className="text-gold-light hover:underline">
                Tạo nhân vật mới
              </Link>
            </p>
          </Step>
        </Card>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-8 lg:self-start">
          <Card className="gold-ring flex flex-col gap-4 p-5">
            <Eyebrow>Cấu hình ngách</Eyebrow>
            <div className="flex items-center gap-3">
              <span className="text-3xl">{niche.icon}</span>
              <div>
                <div className="font-semibold">{niche.name}</div>
                <Link href={`/niches/${niche.id}`} className="text-xs text-gold-light hover:underline">
                  Chỉnh cấu hình
                </Link>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Chip icon={<Clock />}>
                {niche.sceneCount} × {niche.sceneSeconds}s
              </Chip>
              <Chip icon={<Languages />}>{niche.language}</Chip>
            </div>
            {niche.tone && (
              <p className="text-xs leading-relaxed text-muted">
                <span className="text-subtle">Giọng văn: </span>
                {niche.tone}
              </p>
            )}
            {niche.visualStyle && (
              <p className="flex gap-2 text-xs leading-relaxed text-muted">
                <Palette className="mt-0.5 size-3.5 shrink-0 text-gold/80" />
                {niche.visualStyle}
              </p>
            )}
          </Card>

          <Card className="flex flex-col gap-3 p-5 text-xs text-muted">
            <div className="flex justify-between">
              <span>Viết kịch bản</span>
              <span className="text-foreground">1–3 phút</span>
            </div>
            <div className="flex justify-between">
              <span>Sản xuất {niche.sceneCount} cảnh</span>
              <span className="text-foreground">~{sceneMinutes} phút</span>
            </div>
            <div className="flex justify-between">
              <span>Độ dài thành phẩm</span>
              <span className="text-foreground">~{niche.sceneCount * niche.sceneSeconds}s</span>
            </div>
          </Card>

          <Button type="submit" size="lg" className="w-full">
            <WandSparkles /> Viết kịch bản với Muse
          </Button>
        </aside>
      </form>
    </>
  );
}

function CharacterOption({
  value,
  checked,
  name,
  warn,
  children,
}: {
  value: string;
  checked: boolean;
  name: string;
  warn?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="group flex cursor-pointer flex-col gap-2" title={warn ? "Chưa có ảnh tham chiếu" : name}>
      <input type="radio" name="characterId" value={value} defaultChecked={checked} className="sr-only" />
      <span className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl frost transition group-hover:bg-[rgb(255_240_214/0.07)] group-has-checked:shadow-[inset_0_0_0_1px_rgb(214_183_131/0.6),0_0_30px_-10px_rgb(214_183_131/0.6)] group-has-checked:shadow-[0_0_24px_-6px_rgb(214_183_131/0.7)]">
        {children}
      </span>
      <span className="truncate text-center text-xs text-muted group-has-checked:text-gold-light">
        {name}
        {warn && <span className="block text-[10px] text-warning/80">chưa có ảnh</span>}
      </span>
    </label>
  );
}
