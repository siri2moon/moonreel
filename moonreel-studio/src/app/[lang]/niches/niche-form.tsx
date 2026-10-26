"use client";

import { Clapperboard, Monitor, Palette, ScrollText, Smartphone, Sparkles, Trash } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { deleteNiche, saveNiche } from "@/app/actions";
import type { Niche } from "@/db/schema";
import { Button, Card, ErrorNote, Field, inputClass } from "@/components/ui";
import { useI18n } from "@/i18n/client";

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
  const { t } = useI18n();
  const f = t.nicheForm;
  const [icon, setIcon] = useState(niche?.icon ?? "✦");
  const [deleting, startDelete] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const save = saveNiche.bind(null, niche?.id ?? null);
  const icons = ICONS.includes(icon) ? ICONS : [icon, ...ICONS];

  const onDelete = () => {
    if (!niche || !confirm(f.confirmDelete(niche.name))) return;
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

      <Section icon={<Sparkles />} title={f.identity} description={f.identityHint}>
        <Field label={f.icon}>
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
          <Field label={f.name}>
            <input name="name" required defaultValue={niche?.name} className={inputClass} placeholder={f.namePlaceholder} />
          </Field>
          <Field label="Slug" hint={f.slugHint}>
            <input
              name="slug"
              required
              defaultValue={niche?.slug}
              className={`${inputClass} font-mono`}
              pattern="[a-z0-9-]+"
              placeholder={f.slugPlaceholder}
            />
          </Field>
        </div>
        <Field label={f.description}>
          <input
            name="description"
            defaultValue={niche?.description}
            className={inputClass}
            placeholder={f.descriptionPlaceholder}
          />
        </Field>
      </Section>

      <Section
        icon={<ScrollText />}
        title={f.script}
        description={f.scriptHint}
      >
        <Field label={f.instructions} hint={f.instructionsHint}>
          <textarea
            name="scriptInstructions"
            required
            rows={8}
            defaultValue={niche?.scriptInstructions}
            className={`${inputClass} text-[13px] leading-relaxed`}
            placeholder={f.instructionsPlaceholder}
          />
        </Field>
        <div className="grid gap-5 md:grid-cols-2">
          <Field label={f.tone}>
            <input name="tone" defaultValue={niche?.tone} className={inputClass} placeholder={f.tonePlaceholder} />
          </Field>
          <Field label={f.language}>
            <input name="language" required defaultValue={niche?.language ?? "Vietnamese"} className={inputClass} />
          </Field>
        </div>
      </Section>

      <Section icon={<Palette />} title={f.visuals} description={f.visualsHint}>
        <Field label={f.visualStyle} hint={f.visualStyleHint}>
          <textarea
            name="visualStyle"
            rows={2}
            defaultValue={niche?.visualStyle}
            className={inputClass}
          />
        </Field>
        <Field label={f.defaultCharacter} hint={f.defaultCharacterHint}>
          <select name="defaultCharacterId" defaultValue={niche?.defaultCharacterId ?? ""} className={inputClass}>
            <option value="">{t.common.none}</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section icon={<Clapperboard />} title={f.production} description={f.productionHint}>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[13px] font-medium">{f.defaultFormat}</legend>
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: "9:16", title: t.common.vertical, sub: t.common.verticalSub, Icon: Smartphone },
              { value: "16:9", title: t.common.horizontal, sub: t.common.horizontalSub, Icon: Monitor },
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
          <Field label={f.sceneCount}>
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
          <Field label={f.sceneSeconds} hint={f.sceneSecondsHint}>
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
            <Trash /> {f.delete}
          </Button>
        ) : (
          <span className="pl-2 text-xs text-subtle">{f.newNote}</span>
        )}
        <Button type="submit" size="lg">
          {niche ? f.save : f.create}
        </Button>
      </div>
    </form>
  );
}
