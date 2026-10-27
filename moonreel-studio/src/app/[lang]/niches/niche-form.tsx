"use client";

import {
  BookOpen,
  Clapperboard,
  ImageIcon,
  Monitor,
  Palette,
  Repeat,
  ScrollText,
  Smartphone,
  Sparkles,
  Trash,
} from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { deleteNiche, saveNiche } from "@/app/actions";
import type { Niche, NicheFormat } from "@/db/schema";
import { Button, Card, ErrorNote, Field, inputClass } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import { CastPicker, type CastOption } from "@/components/cast-picker";
import { ThumbnailPreview } from "@/components/thumbnail-preview";
import { THUMBNAIL_STYLES, type ThumbnailStyle } from "@/lib/thumbnail-styles";

const ICONS = ["💰", "🔭", "🌙", "🤖", "😂", "🍜", "💪", "✈️", "📚", "🎮", "💄", "🐾", "🧠", "⚽", "🎵", "✦"];


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

export function NicheForm({
  niche,
  characters,
  defaultCastIds,
}: {
  niche?: Niche;
  characters: CastOption[];
  defaultCastIds: string[];
}) {
  const { t } = useI18n();
  const f = t.nicheForm;
  const [icon, setIcon] = useState(niche?.icon ?? "✦");
  const [format, setFormat] = useState<NicheFormat>(niche?.format ?? "story");
  const [thumbStyle, setThumbStyle] = useState<ThumbnailStyle>(
    (THUMBNAIL_STYLES as readonly string[]).includes(niche?.thumbnailStyle ?? "")
      ? (niche!.thumbnailStyle as ThumbnailStyle)
      : "impact",
  );
  const [accent, setAccent] = useState(niche?.thumbnailAccent ?? "#FFC23D");
  const [brand, setBrand] = useState(niche?.thumbnailBrand ?? "");
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
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[13px] font-medium">{f.format}</legend>
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: "story" as const, Icon: BookOpen },
              { value: "ambient" as const, Icon: Repeat },
            ].map(({ value, Icon }) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-3 rounded-xl frost p-3.5 transition has-checked:shadow-[inset_0_0_0_1px_rgb(214_183_131/0.6),0_0_30px_-10px_rgb(214_183_131/0.6)] has-checked:bg-gold/[0.07]"
              >
                <input
                  type="radio"
                  name="format"
                  value={value}
                  checked={format === value}
                  onChange={() => setFormat(value)}
                  className="sr-only"
                />
                <Icon className="size-5 text-gold" />
                <span>
                  <span className="block text-sm font-medium">{f.formats[value].title}</span>
                  <span className="block text-xs text-subtle">{f.formats[value].sub}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-subtle">{f.formatHint}</p>
          {format === "ambient" && (
            <label className="mt-2 flex cursor-pointer items-start gap-3 rounded-xl frost p-3.5">
              <input
                type="checkbox"
                name="fixedCamera"
                defaultChecked={niche?.fixedCamera ?? false}
                className="mt-0.5 size-4 accent-[#d6b783]"
              />
              <span>
                <span className="block text-sm font-medium">{f.fixedCamera}</span>
                <span className="block text-xs leading-relaxed text-subtle">{f.fixedCameraHint}</span>
              </span>
            </label>
          )}
        </fieldset>
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
        {/* Ambient videos play the uploaded soundtrack; there is nothing to narrate. */}
        <Field label={f.narratorVoice} hint={f.narratorVoiceHint} className={format === "ambient" ? "hidden!" : ""}>
          <input
            name="narratorVoiceId"
            defaultValue={niche?.narratorVoiceId ?? ""}
            className={`${inputClass} font-mono`}
            placeholder="voice ID from elevenlabs.io → Voices"
          />
        </Field>
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
        {/* Not a Field: a <label> would pass clicks on its text to the first character button. */}
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-foreground/90">{f.defaultCharacter}</span>
          <CastPicker name="defaultCastIds" options={characters} defaultIds={defaultCastIds} />
          <span className="text-xs leading-relaxed text-subtle">{f.defaultCharacterHint}</span>
        </div>
      </Section>

      <Section icon={<ImageIcon />} title={f.thumbnail} description={f.thumbnailHint}>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[13px] font-medium">{f.thumbnailStyle}</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {THUMBNAIL_STYLES.map((value) => (
              <label
                key={value}
                className="flex cursor-pointer flex-col gap-2.5 rounded-xl frost p-2.5 transition has-checked:shadow-[inset_0_0_0_1px_rgb(214_183_131/0.6),0_0_30px_-10px_rgb(214_183_131/0.6)] has-checked:bg-gold/[0.07]"
              >
                <input
                  type="radio"
                  name="thumbnailStyle"
                  value={value}
                  checked={thumbStyle === value}
                  onChange={() => setThumbStyle(value)}
                  className="sr-only"
                />
                <ThumbnailPreview style={value} accent={accent} brand={brand} headline={f.thumbnailSample} />
                <span className="px-1">
                  <span className="block text-sm font-medium">{f.thumbnailStyles[value].title}</span>
                  <span className="block text-xs text-subtle">{f.thumbnailStyles[value].sub}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-5 md:grid-cols-2">
          <Field label={f.thumbnailAccent} hint={f.thumbnailAccentHint}>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={accent}
                onChange={(e) => setAccent(e.target.value.toUpperCase())}
                className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border-0 bg-transparent p-0"
                aria-label={f.thumbnailAccent}
              />
              <input
                name="thumbnailAccent"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                pattern="#[0-9a-fA-F]{6}"
                required
                className={inputClass}
              />
            </div>
          </Field>
          <Field label={f.thumbnailBrand} hint={f.thumbnailBrandHint}>
            <input
              name="thumbnailBrand"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              maxLength={32}
              className={inputClass}
              placeholder="My Channel"
            />
          </Field>
        </div>
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
              max={40}
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
