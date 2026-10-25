"use client";

import { Clapperboard, Monitor, Palette, ScrollText, Smartphone, Sparkles, Trash } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { deleteNiche, saveNiche } from "@/app/actions";
import type { Niche } from "@/db/schema";
import { Button, Card, ErrorNote, Field, inputClass } from "@/components/ui";

const ICONS = ["💰", "🔭", "🌙", "🤖", "😂", "🍜", "💪", "✈️", "📚", "🎮", "💄", "🐾", "🧠", "⚽", "🎵", "✦"];

export interface CharacterOption {
  id: string;
  name: string;
}

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card className="grid gap-6 p-6 md:grid-cols-[220px_1fr] md:p-8">
      <div className="flex flex-col gap-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-gold/10 text-gold [&_svg]:size-[18px]">
          {icon}
        </span>
        <h2 className="font-semibold">{title}</h2>
        <p className="text-xs leading-relaxed text-subtle">{description}</p>
      </div>
      <div className="flex flex-col gap-5">{children}</div>
    </Card>
  );
}

export function NicheForm({ niche, characters }: { niche?: Niche; characters: CharacterOption[] }) {
  const [icon, setIcon] = useState(niche?.icon ?? "✦");
  const [deleting, startDelete] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const save = saveNiche.bind(null, niche?.id ?? null);
  const icons = ICONS.includes(icon) ? ICONS : [icon, ...ICONS];

  const onDelete = () => {
    if (!niche || !confirm(`Xoá ngách "${niche.name}"?`)) return;
    startDelete(async () => {
      setError(null);
      try {
        await deleteNiche(niche.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  return (
    <form action={save} className="flex flex-col gap-5">
      {error && <ErrorNote>{error}</ErrorNote>}

      <Section icon={<Sparkles />} title="Nhận diện" description="Tên và biểu tượng hiển thị khắp app.">
        <Field label="Biểu tượng">
          <input type="hidden" name="icon" value={icon} />
          <div className="flex flex-wrap gap-2">
            {icons.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setIcon(emoji)}
                className={`flex size-11 items-center justify-center rounded-2xl text-xl transition ${
                  icon === emoji
                    ? "bg-gold/15 shadow-[inset_0_0_0_1px_rgb(214_183_131/0.7),0_0_24px_-4px_rgb(214_183_131/0.6)]"
                    : "frost hover:bg-[rgb(255_240_214/0.08)]"
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Tên ngách">
            <input name="name" required defaultValue={niche?.name} className={inputClass} placeholder="Hài hước & Cà khịa" />
          </Field>
          <Field label="Slug" hint="Định danh duy nhất: chữ thường, số, gạch ngang">
            <input
              name="slug"
              required
              defaultValue={niche?.slug}
              className={`${inputClass} font-mono`}
              pattern="[a-z0-9-]+"
              placeholder="hai-huoc"
            />
          </Field>
        </div>
        <Field label="Mô tả ngắn">
          <input
            name="description"
            defaultValue={niche?.description}
            className={inputClass}
            placeholder="Kênh nói về điều gì, cho ai xem"
          />
        </Field>
      </Section>

      <Section
        icon={<ScrollText />}
        title="Kịch bản AI"
        description="Muse tuân theo các hướng dẫn này cho mọi video trong ngách."
      >
        <Field label="Hướng dẫn viết kịch bản" hint="Cấu trúc, cách mở đầu (hook), điều cấm, lời kêu gọi cuối video…">
          <textarea
            name="scriptInstructions"
            required
            rows={8}
            defaultValue={niche?.scriptInstructions}
            className={`${inputClass} text-[13px] leading-relaxed`}
            placeholder={"- Mở đầu bằng một câu gây tò mò\n- Mỗi cảnh một ý\n- Kết thúc kêu gọi follow"}
          />
        </Field>
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Giọng văn">
            <input name="tone" defaultValue={niche?.tone} className={inputClass} placeholder="Hài hước, châm biếm nhẹ" />
          </Field>
          <Field label="Ngôn ngữ lời thoại">
            <input name="language" required defaultValue={niche?.language ?? "Vietnamese"} className={inputClass} />
          </Field>
        </div>
      </Section>

      <Section icon={<Palette />} title="Hình ảnh" description="Phong cách áp lên mọi cảnh, viết bằng tiếng Anh.">
        <Field label="Phong cách hình ảnh" hint="Ví dụ: clean modern 3D animation, soft warm lighting, pastel colors">
          <textarea
            name="visualStyle"
            rows={2}
            defaultValue={niche?.visualStyle}
            className={inputClass}
          />
        </Field>
        <Field label="Nhân vật mặc định" hint="Được chọn sẵn khi tạo video mới trong ngách này.">
          <select name="defaultCharacterId" defaultValue={niche?.defaultCharacterId ?? ""} className={inputClass}>
            <option value="">— Không có —</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section icon={<Clapperboard />} title="Sản xuất" description="Độ dài và định dạng mặc định của video.">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[13px] font-medium">Định dạng mặc định</legend>
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: "9:16", title: "Dọc 9:16", sub: "TikTok · Reels · Shorts", Icon: Smartphone },
              { value: "16:9", title: "Ngang 16:9", sub: "YouTube", Icon: Monitor },
            ].map(({ value, title, sub, Icon }) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-3 rounded-xl frost p-3.5 transition has-checked:shadow-[inset_0_0_0_1px_rgb(214_183_131/0.6),0_0_30px_-10px_rgb(214_183_131/0.6)] has-checked:bg-gold/[0.07]"
              >
                <input
                  type="radio"
                  name="defaultAspectRatio"
                  value={value}
                  defaultChecked={(niche?.defaultAspectRatio ?? "9:16") === value}
                  className="sr-only"
                />
                <Icon className="size-5 text-gold" />
                <span>
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="block text-xs text-subtle">{sub}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Số cảnh">
            <input
              name="sceneCount"
              type="number"
              min={1}
              max={20}
              required
              defaultValue={niche?.sceneCount ?? 6}
              className={inputClass}
            />
          </Field>
          <Field label="Giây mỗi cảnh" hint="Muse tạo clip tối đa khoảng 10 giây">
            <input
              name="sceneSeconds"
              type="number"
              min={4}
              max={10}
              required
              defaultValue={niche?.sceneSeconds ?? 10}
              className={inputClass}
            />
          </Field>
        </div>
      </Section>

      <div className="glass sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-2xl p-3">
        {niche ? (
          <Button variant="danger" onClick={onDelete} disabled={deleting}>
            <Trash /> Xoá ngách
          </Button>
        ) : (
          <span className="pl-2 text-xs text-subtle">Ngách mới sẽ được chọn làm ngách đang dùng.</span>
        )}
        <Button type="submit" size="lg">
          {niche ? "Lưu cấu hình" : "Tạo ngách"}
        </Button>
      </div>
    </form>
  );
}
