"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Captions,
  Check,
  ChevronDown,
  Clapperboard,
  Copy,
  Download,
  Film,
  Image as ImageIcon,
  ImagePlus,
  Megaphone,
  Mic,
  Music,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Scissors,
  Sparkles,
  StickyNote,
  Trash,
  UserRound,
  Video,
  WandSparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import {
  approveAndProduce,
  cutShorts,
  deleteProject,
  editScene,
  regeneratePosts,
  regenerateScript,
  replaceSoundtrack,
  rerender,
  setReferenceImage,
  retryScenes,
  saveScript,
  updateShort,
  updateThumbnail,
  type SceneInput,
  type ShortInput,
  type ThumbnailInput,
} from "@/app/actions";
import { ReferenceImageUpload } from "@/components/reference-image-upload";
import { formatDuration, SoundtrackUpload } from "@/components/soundtrack-upload";
import { StatusBadge } from "@/components/status-badge";
import { Button, buttonClass, Card, ErrorNote, inputClass } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import { isRefusal, refusalReply } from "@/lib/scene-errors";
import type { ProjectView } from "@/lib/views";
import type { SocialPosts } from "@/db/schema";

const BUSY = new Set(["scripting", "producing", "rendering"]);
const POLL_MS = 3_000;

type Scene = ProjectView["scenes"][number];
type Short = ProjectView["shorts"][number];

/**
 * Set for ambient videos, which loop under an uploaded soundtrack: the "narration" is a silent
 * shot note and the video runs as long as the audio.
 */
const AmbientContext = createContext<{ audioSeconds: number | null } | null>(null);

/** The project's cast, lead first. */
const CastContext = createContext<ProjectView["cast"]>([]);

/**
 * Who is on screen in a shot, for casts of two or more (a lone character is in every shot).
 * Picks keep the cast's order, so the most important character comes first.
 */
function SceneCast({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { t } = useI18n();
  const cast = useContext(CastContext);
  if (cast.length < 2) return null;
  const toggle = (id: string) =>
    onChange(cast.map((c) => c.id).filter((c) => (c === id ? !value.includes(id) : value.includes(c))));
  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-center gap-1.5 text-xs text-muted">
        <UserRound className="size-3.5 text-gold/80" /> {t.project.onScreen}
      </span>
      <div className="flex flex-wrap gap-2">
        {cast.map((c) => {
          const on = value.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => toggle(c.id)}
              aria-pressed={on}
              className={`flex items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-0.5 text-xs transition ${on ? "bg-gold/15 text-gold-light shadow-[inset_0_0_0_1px_rgb(214_183_131/0.5)]" : "frost text-subtle hover:text-muted"}`}
            >
              {c.referenceUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.referenceUrl} alt="" className={`size-5 rounded-full object-cover ${on ? "" : "opacity-50"}`} />
              ) : (
                <span className="size-5 rounded-full bg-gold/20" />
              )}
              {c.name}
            </button>
          );
        })}
        {value.length === 0 && <span className="self-center text-xs text-subtle">{t.project.nobodyOnScreen}</span>}
      </div>
    </div>
  );
}

/** Label and word counter of the narration field; ambient shot notes have no word budget. */
function NarrationLabel({ text }: { text: string }) {
  const { t } = useI18n();
  const ambient = useContext(AmbientContext);
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return (
    <span className="flex items-center justify-between text-xs text-muted">
      <span className="flex items-center gap-1.5">
        {ambient ? <StickyNote className="size-3.5 text-gold/80" /> : <Mic className="size-3.5 text-gold/80" />}
        {ambient ? t.project.ambient.shotNote : t.project.narration}
      </span>
      {!ambient && <span className={words > 25 ? "text-warning" : "text-subtle"}>{t.project.words(words)}</span>}
    </span>
  );
}

function toDraft(scenes: Scene[]): SceneInput[] {
  return scenes.map(({ narration, visualPrompt, camera, characterIds }) => ({ narration, visualPrompt, camera, characterIds }));
}

/** The script is editable until production has produced anything. */
function isEditable(view: ProjectView) {
  if (view.status === "script_ready") return true;
  return (
    view.status === "failed" &&
    view.scenes.length > 0 &&
    view.scenes.every((s) => s.status === "pending" && !s.keyframeUrl && !s.clipUrl)
  );
}

export function ProjectEditor({ initial }: { initial: ProjectView }) {
  const { t } = useI18n();
  const [view, setView] = useState(initial);
  const [title, setTitle] = useState(initial.title);
  const [draft, setDraft] = useState(() => toDraft(initial.scenes));
  const [pending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const statusRef = useRef(initial.status);
  useEffect(() => {
    statusRef.current = view.status;
  }, [view.status]);

  // Poll while a background job is running; pick up the fresh script once it lands.
  useEffect(() => {
    const background =
      view.postsStatus === "writing" ||
      view.thumbnailStatus === "drawing" ||
      view.shortsStatus === "writing" ||
      view.shorts.some((s) => s.status === "rendering");
    if (!BUSY.has(view.status) && !background) return;
    let alive = true;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${view.id}`, { cache: "no-store" });
        if (!res.ok || !alive) return;
        const next = (await res.json()) as ProjectView;
        if (statusRef.current === "scripting" && next.status !== "scripting") {
          setTitle(next.title);
          setDraft(toDraft(next.scenes));
        }
        setView(next);
      } catch {
        // Transient network error: try again on the next tick.
      }
    }, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [view.id, view.status, view.postsStatus, view.thumbnailStatus, view.shortsStatus, view.shorts]);

  /** Fetches the project again right away, e.g. after queueing work the poll should pick up. */
  const refresh = async () => {
    const res = await fetch(`/api/projects/${view.id}`, { cache: "no-store" });
    if (res.ok) setView((await res.json()) as ProjectView);
  };

  const run = (fn: () => Promise<unknown>, optimistic?: Partial<ProjectView>) =>
    startTransition(async () => {
      setActionError(null);
      try {
        await fn();
        if (optimistic) setView((v) => ({ ...v, ...optimistic }));
      } catch (err) {
        setActionError(err instanceof Error ? err.message : String(err));
      }
    });

  const editable = isEditable(view);
  const scenesForAction = draft.filter((s) => s.narration.trim() && s.visualPrompt.trim());

  const ambient = view.niche.format === "ambient" ? { audioSeconds: view.audioSeconds } : null;

  return (
    <AmbientContext value={ambient}>
      <CastContext value={view.cast}>
        <div className="flex flex-col gap-8">
          <Header view={view} onDelete={() => run(() => deleteProject(view.id))} pending={pending} />
          <Stepper view={view} editable={editable} />

          {(view.error || actionError) && <ErrorNote>{actionError ?? view.error}</ErrorNote>}

          {view.status === "scripting" && <Writing />}

          {ambient !== null && view.status !== "scripting" && (
            <div className="grid gap-4 md:grid-cols-[1fr_minmax(0,320px)]">
              <Card className="flex flex-col gap-3 p-5">
                <span className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.2em] text-gold uppercase">
                  <Music className="size-3.5" /> {t.project.ambient.soundtrack}
                </span>
                <SoundtrackUpload
                  initialUrl={view.audioUrl}
                  disabled={pending || view.status === "rendering"}
                  onUploaded={(key) =>
                    run(
                      () => replaceSoundtrack(view.id, key),
                      view.status === "done" ? { status: "rendering", error: null } : undefined,
                    )
                  }
                />
                <p className="text-xs text-subtle">{t.project.ambient.replaceHint}</p>
              </Card>
              <Card className="flex flex-col gap-3 p-5">
                <span className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.2em] text-gold uppercase">
                  <ImagePlus className="size-3.5" /> {t.project.ambient.reference}
                </span>
                <ReferenceImageUpload
                  initialUrl={view.referenceImageUrl}
                  disabled={pending}
                  onChange={(key) => run(() => setReferenceImage(view.id, key))}
                />
                <p className="text-xs text-subtle">{t.project.ambient.referenceHint}</p>
              </Card>
            </div>
          )}

          {view.status === "failed" && view.scenes.length === 0 && (
            <div>
              <Button
                disabled={pending}
                onClick={() => run(() => regenerateScript(view.id), { status: "scripting", error: null })}
              >
                <RotateCcw /> {t.project.rewrite}
              </Button>
            </div>
          )}

          {editable && (
            <ScriptEditor
              title={title}
              setTitle={setTitle}
              draft={draft}
              setDraft={setDraft}
              sceneSeconds={view.niche.sceneSeconds}
              pending={pending}
              onSave={() => run(() => saveScript(view.id, title, scenesForAction))}
              onRegenerate={() => run(() => regenerateScript(view.id), { status: "scripting", error: null })}
              onApprove={() =>
                run(() => approveAndProduce(view.id, title, scenesForAction), {
                  status: "producing",
                  error: null,
                })
              }
            />
          )}

          {!editable && view.scenes.length > 0 && view.status !== "scripting" && (
            <Production
              view={view}
              pending={pending}
              onRetry={(ids, newKeyframe) =>
                run(() => retryScenes(view.id, ids, { newKeyframe }), { status: "producing", error: null })
              }
              onRender={() => run(() => rerender(view.id), { status: "rendering", error: null })}
              onRegeneratePosts={() =>
                run(() => regeneratePosts(view.id), { postsStatus: "writing", postsError: null })
              }
              onThumbnail={(input, newImage) =>
                run(() => updateThumbnail(view.id, input, { newImage }), {
                  thumbnailStatus: "drawing",
                  thumbnailError: null,
                })
              }
              onCutShorts={() =>
                run(() => cutShorts(view.id), { shortsStatus: "writing", shortsError: null })
              }
              onShort={(shortId, input) =>
                run(async () => {
                  await updateShort(view.id, shortId, input);
                  await refresh();
                })
              }
              onEdit={(sceneId, input, newKeyframe) =>
                run(() => editScene(view.id, sceneId, input, { newKeyframe }), { status: "producing", error: null })
              }
            />
          )}
        </div>
      </CastContext>
    </AmbientContext>
  );
}

function Header({
  view,
  onDelete,
  pending,
}: {
  view: ProjectView;
  onDelete: () => void;
  pending: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-4">
      <Link href="/" className="flex w-fit items-center gap-1.5 text-xs text-muted transition hover:text-gold-light">
        <ArrowLeft className="size-3.5" /> {view.niche.icon} {view.niche.name}
      </Link>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{view.title}</h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <StatusBadge status={view.status} />
            <span className="rounded-md frost px-2 py-0.5 font-mono">{view.aspectRatio}</span>
            {view.cast.map((c) => (
              <span key={c.id} className="flex items-center gap-1.5 rounded-full frost py-0.5 pr-2.5 pl-0.5">
                {c.referenceUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.referenceUrl} alt="" className="size-5 rounded-full object-cover" />
                ) : (
                  <span className="size-5 rounded-full bg-gold/20" />
                )}
                {c.name}
              </span>
            ))}
          </div>
          <p className="max-w-3xl text-sm text-subtle">
            <span className="text-muted">{t.project.topic}</span> {view.topic}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="hover:text-danger"
          disabled={pending}
          onClick={() => confirm(t.project.confirmDelete) && onDelete()}
        >
          <Trash /> {t.project.delete}
        </Button>
      </div>
    </div>
  );
}

const STEPS = [
  { key: "script", Icon: Sparkles },
  { key: "review", Icon: Check },
  { key: "produce", Icon: Clapperboard },
  { key: "render", Icon: Film },
  { key: "done", Icon: Download },
] as const;

function currentStep(view: ProjectView, editable: boolean) {
  switch (view.status) {
    case "scripting":
      return 0;
    case "script_ready":
      return 1;
    case "producing":
      return 2;
    case "rendering":
      return 3;
    case "done":
      return 4;
    case "failed":
      if (view.scenes.length === 0) return 0;
      if (editable) return 1;
      return view.scenes.every((s) => s.status === "done") ? 3 : 2;
  }
}

function Stepper({ view, editable }: { view: ProjectView; editable: boolean }) {
  const { t } = useI18n();
  const at = currentStep(view, editable);
  const failed = view.status === "failed";
  return (
    <ol className="glass flex items-center gap-2 overflow-x-auto rounded-2xl p-3">
      {STEPS.map(({ key, Icon }, i) => {
        const done = i < at || view.status === "done";
        const active = i === at && view.status !== "done";
        return (
          <li key={key} className="flex flex-1 items-center gap-2">
            <span
              className={`flex size-8 shrink-0 items-center justify-center rounded-full transition [&_svg]:size-4 ${
                done
                  ? "bg-gold text-[#21180a] shadow-[inset_0_1px_0_rgb(255_255_255/0.6)]"
                  : active
                    ? failed
                      ? "bg-danger/10 text-danger shadow-[inset_0_0_0_1px_rgb(255_122_122/0.5)]"
                      : "bg-gold/10 text-gold shadow-[inset_0_0_0_1px_rgb(214_183_131/0.7),0_0_22px_-4px_rgb(214_183_131/0.8)]"
                    : "frost text-subtle"
              }`}
            >
              {done ? <Check /> : <Icon />}
            </span>
            <span
              className={`text-xs font-medium whitespace-nowrap ${done || active ? "text-foreground" : "text-subtle"}`}
            >
              {t.project.steps[key]}
            </span>
            {i < STEPS.length - 1 && (
              <span className={`mx-1 hidden h-px min-w-6 flex-1 md:block ${done ? "bg-gold/60" : "bg-border"}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Writing() {
  const { t } = useI18n();
  return <Working icon={<WandSparkles className="size-6" />} title={t.project.writingTitle} body={t.project.writingBody} />;
}

/**
 * A panel of the project page whose body folds away under its header. Every section starts
 * open; a folded body is only hidden, so drafts and video positions inside it survive.
 */
function Section({
  icon,
  eyebrow,
  heading,
  sub,
  actions,
  bare = false,
  className = "",
  children,
}: {
  icon?: ReactNode;
  eyebrow?: string;
  heading: string;
  sub?: ReactNode;
  actions?: ReactNode;
  /** No card around it, for sections that already sit on the page background. */
  bare?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(true);
  const toggle = () => setOpen((o) => !o);
  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex min-w-0 flex-col gap-1 text-left">
        {eyebrow && (
          <span className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.2em] text-gold uppercase [&_svg]:size-3.5">
            {icon} {eyebrow}
          </span>
        )}
        <h2 className="text-lg font-semibold tracking-tight">{heading}</h2>
        {sub}
      </button>
      <div className="flex flex-wrap items-center gap-2">
        {open && actions}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          aria-expanded={open}
          title={open ? t.project.collapse : t.project.expand}
        >
          <ChevronDown className={`transition-transform ${open ? "" : "-rotate-90"}`} />
        </Button>
      </div>
    </div>
  );
  const body = (
    <div hidden={!open} className="flex flex-col gap-5">
      {children}
    </div>
  );
  if (bare) {
    return (
      <section className={`flex flex-col gap-5 ${className}`}>
        {header}
        {body}
      </section>
    );
  }
  return (
    <Card className={`flex flex-col gap-5 p-5 md:p-8 ${className}`}>
      {header}
      {body}
    </Card>
  );
}

/** A background job is running; the page polls and swaps this out when it finishes. */
function Working({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <Card className="gold-ring relative flex flex-col items-center gap-5 overflow-hidden px-6 py-16 text-center">
      <div className="pointer-events-none absolute top-1/2 left-1/2 size-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold/10 blur-[80px]" />
      <span className="relative flex size-16 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-gold/20" />
        <span className="bg-gold relative flex size-14 items-center justify-center rounded-full text-[#21180a]">
          {icon}
        </span>
      </span>
      <div className="relative flex flex-col gap-1.5">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted">{body}</p>
      </div>
    </Card>
  );
}

function ScriptEditor(props: {
  title: string;
  setTitle: (v: string) => void;
  draft: SceneInput[];
  setDraft: (fn: (d: SceneInput[]) => SceneInput[]) => void;
  sceneSeconds: number;
  pending: boolean;
  onSave: () => void;
  onRegenerate: () => void;
  onApprove: () => void;
}) {
  const { title, setTitle, draft, setDraft, sceneSeconds, pending } = props;
  const { t } = useI18n();
  const ambient = useContext(AmbientContext);
  const cast = useContext(CastContext);

  const update = (i: number, patch: Partial<SceneInput>) =>
    setDraft((d) => d.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, dir: -1 | 1) =>
    setDraft((d) => {
      const j = i + dir;
      if (j < 0 || j >= d.length) return d;
      const next = [...d];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const remove = (i: number) => setDraft((d) => d.filter((_, j) => j !== i));
  const add = () =>
    setDraft((d) => [
      ...d,
      { narration: "", visualPrompt: "", camera: "static medium shot", characterIds: cast.slice(0, 1).map((c) => c.id) },
    ]);

  return (
    <div className="flex flex-col gap-5">
      <div className="glass sticky top-[7.5rem] z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl p-3 pl-5 lg:top-4">
        <div className="text-sm">
          <span className="font-semibold">{t.project.script}</span>
          <span className="text-muted">
            {ambient
              ? t.project.ambient.scriptSummary(
                  draft.length,
                  ambient.audioSeconds ? formatDuration(ambient.audioSeconds) : null,
                )
              : t.project.scriptSummary(draft.length, draft.length * sceneSeconds)}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" disabled={pending} onClick={props.onRegenerate}>
            <RotateCcw /> {t.project.regenerate}
          </Button>
          <Button variant="secondary" size="sm" disabled={pending} onClick={props.onSave}>
            <Save /> {t.project.saveDraft}
          </Button>
          <Button disabled={pending || draft.length === 0} onClick={props.onApprove}>
            <Check /> {t.project.approve}
          </Button>
        </div>
      </div>

      <Card className="p-5">
        <label className="flex flex-col gap-2">
          <span className="text-[11px] font-semibold tracking-[0.2em] text-subtle uppercase">{t.project.videoTitle}</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-transparent text-xl font-bold tracking-tight outline-none placeholder:text-subtle"
            placeholder={t.project.videoTitle}
          />
        </label>
      </Card>

      <div className="flex flex-col gap-4">
        {draft.map((scene, i) => {
          return (
            <Card key={i} className="group flex gap-4 p-5 transition glass-hover">
              <div className="flex flex-col items-center gap-1">
                <span className="text-gold flex size-9 items-center justify-center rounded-xl border border-gold/25 bg-gold/5 text-sm font-bold">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="mt-1 flex flex-col opacity-60 transition group-hover:opacity-100">
                  <Button variant="ghost" size="icon" onClick={() => move(i, -1)} disabled={i === 0} title={t.project.up}>
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => move(i, 1)}
                    disabled={i === draft.length - 1}
                    title={t.project.down}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="hover:text-danger"
                    onClick={() => remove(i)}
                    title={t.project.removeScene}
                  >
                    <X />
                  </Button>
                </div>
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-4">
                <label className="flex flex-col gap-2">
                  <NarrationLabel text={scene.narration} />
                  <textarea
                    rows={2}
                    value={scene.narration}
                    onChange={(e) => update(i, { narration: e.target.value })}
                    className={`${inputClass} text-[15px] leading-relaxed`}
                  />
                </label>
                <div className="grid gap-4 md:grid-cols-[1fr_220px]">
                  <label className="flex flex-col gap-2">
                    <span className="flex items-center gap-1.5 text-xs text-muted">
                      <ImageIcon className="size-3.5 text-gold/80" /> {t.project.visual}
                    </span>
                    <textarea
                      rows={3}
                      value={scene.visualPrompt}
                      onChange={(e) => update(i, { visualPrompt: e.target.value })}
                      className={`${inputClass} text-[13px] leading-relaxed`}
                    />
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="flex items-center gap-1.5 text-xs text-muted">
                      <Video className="size-3.5 text-gold/80" /> {t.project.camera}
                    </span>
                    <input
                      value={scene.camera ?? ""}
                      onChange={(e) => update(i, { camera: e.target.value })}
                      className={`${inputClass} text-[13px]`}
                    />
                  </label>
                </div>
                <SceneCast value={scene.characterIds ?? []} onChange={(characterIds) => update(i, { characterIds })} />
              </div>
            </Card>
          );
        })}
      </div>

      <button
        type="button"
        onClick={add}
        className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-[rgb(255_232_196/0.16)] py-4 text-sm text-muted transition hover:bg-[rgb(255_240_214/0.07)] hover:bg-gold/[0.03] hover:text-gold-light"
      >
        <Plus className="size-4" /> {t.project.addScene}
      </button>
    </div>
  );
}

function Production({
  view,
  pending,
  onRetry,
  onRender,
  onRegeneratePosts,
  onThumbnail,
  onCutShorts,
  onShort,
  onEdit,
}: {
  view: ProjectView;
  pending: boolean;
  onRetry: (ids: string[], newKeyframe: boolean) => void;
  onRender: () => void;
  onRegeneratePosts: () => void;
  onThumbnail: (input: ThumbnailInput, newImage: boolean) => void;
  onCutShorts: () => void;
  onShort: (shortId: string, input: ShortInput) => void;
  onEdit: (sceneId: string, input: SceneInput, newKeyframe: boolean) => void;
}) {
  const [editing, setEditing] = useState<Scene | null>(null);
  const { t } = useI18n();
  const total = view.scenes.length;
  const done = view.scenes.filter((s) => s.status === "done").length;
  const failed = view.scenes.filter((s) => s.status === "failed");
  const vertical = view.aspectRatio === "9:16";
  const allDone = done === total;
  const percent = Math.round((done / total) * 100);

  return (
    <div className="flex flex-col gap-8">
      {view.status === "rendering" && (
        <Working
          icon={<Film className="size-6" />}
          title={t.project.renderingTitle}
          body={view.niche.format === "ambient" ? t.project.renderingBodyLoop : t.project.renderingBody}
        />
      )}

      {view.finalVideoUrl && view.status === "done" && (
        <Section
          icon={<Sparkles />}
          eyebrow={t.project.final}
          heading={t.project.finalTitle}
          className="gold-ring relative overflow-hidden"
        >
          <div className="pointer-events-none absolute -top-24 -left-24 size-80 rounded-full bg-gold/15 blur-[100px]" />
          <div className={`relative flex flex-col gap-8 ${vertical ? "md:flex-row md:items-center" : ""}`}>
            <video
              src={view.finalVideoUrl}
              controls
              className={`rounded-2xl bg-black shadow-[0_30px_80px_-20px_rgb(0_0_0/0.9)] ring-1 ring-gold/30 ${
                vertical ? "mx-auto w-full max-w-[320px]" : "w-full"
              }`}
            />
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted">
                {view.niche.format === "ambient"
                  ? t.project.ambient.finalBody(total, view.aspectRatio)
                  : t.project.finalBody(total, view.aspectRatio)}
              </p>
              <div className="flex flex-wrap gap-2">
                <a href={`${view.finalVideoUrl}&download=${view.fileSlug}`} className={buttonClass("primary", "lg")}>
                  <Download /> {t.project.downloadMp4}
                </a>
                {view.captionsUrl && (
                  <a href={`${view.captionsUrl}&download=${view.fileSlug}`} className={buttonClass("secondary", "lg")}>
                    <Captions /> {t.project.downloadSrt}
                  </a>
                )}
              </div>
              <Button variant="ghost" size="sm" disabled={pending} onClick={onRender} className="self-start">
                <RotateCcw /> {t.project.rerender}
              </Button>
            </div>
          </div>
        </Section>
      )}

      {view.status === "done" && (
        <>
          <ThumbnailPanel view={view} pending={pending} onSubmit={onThumbnail} />
          <PostsPanel view={view} pending={pending} onRegenerate={onRegeneratePosts} />
          {view.niche.format !== "ambient" && (
            <ShortsPanel view={view} pending={pending} onCut={onCutShorts} onSave={onShort} />
          )}
        </>
      )}

      <Section
        bare
        heading={t.project.productionTitle}
        sub={<span className="text-xs text-muted">{t.project.progress(done, total, percent)}</span>}
        actions={
          <>
            {failed.length > 0 && (
              <Button variant="secondary" disabled={pending} onClick={() => onRetry(failed.map((s) => s.id), false)}>
                <RotateCcw /> {t.project.retryFailed(failed.length)}
              </Button>
            )}
            {allDone && view.status !== "rendering" && view.status !== "done" && (
              <Button disabled={pending} onClick={onRender}>
                <Film /> {t.project.render}
              </Button>
            )}
          </>
        }
      >

        <div className="h-1.5 overflow-hidden rounded-full frost">
          <div
            className="bg-gold animate-shine h-full rounded-full transition-all duration-700"
            style={{ width: `${percent}%` }}
          />
        </div>

        <div
          className={`grid gap-4 ${vertical ? "grid-cols-2 md:grid-cols-3 xl:grid-cols-4" : "md:grid-cols-2 xl:grid-cols-3"}`}
        >
          {view.scenes.map((scene) => (
            <SceneCard
              key={scene.id}
              scene={scene}
              vertical={vertical}
              pending={pending}
              onRetry={(newKeyframe) => onRetry([scene.id], newKeyframe)}
              onEdit={() => setEditing(scene)}
            />
          ))}
        </div>
      </Section>

      {editing && (
        <SceneEditDialog
          scene={editing}
          pending={pending}
          onClose={() => setEditing(null)}
          onSubmit={(input, newKeyframe) => onEdit(editing.id, input, newKeyframe)}
        />
      )}
    </div>
  );
}

function ThumbnailPanel({
  view,
  pending,
  onSubmit,
}: {
  view: ProjectView;
  pending: boolean;
  onSubmit: (input: ThumbnailInput, newImage: boolean) => void;
}) {
  const { t } = useI18n();
  const tt = t.project.thumbnail;
  const spec = view.thumbnail;
  const [draft, setDraft] = useState<ThumbnailInput | null>(() =>
    spec ? { text: spec.text, prompt: spec.prompt, background: spec.background, scene: spec.scene } : null,
  );
  // The spec arrives with the captions; start the form from it the first time it shows up.
  if (spec && !draft) {
    setDraft({ text: spec.text, prompt: spec.prompt, background: spec.background, scene: spec.scene });
  }
  const drawing = view.thumbnailStatus === "drawing";
  const vertical = view.aspectRatio === "9:16";
  const busy = pending || drawing;
  const withKeyframes = view.scenes.filter((s) => s.keyframeUrl);

  return (
    <Section icon={<ImageIcon />} eyebrow={tt.eyebrow} heading={tt.heading}>

      {!spec && (
        <p className="text-sm text-muted">
          {view.postsStatus === "writing" ? tt.waiting : tt.missing}
        </p>
      )}
      {view.thumbnailStatus === "failed" && view.thumbnailError && <ErrorNote>{view.thumbnailError}</ErrorNote>}

      {spec && draft && (
        <div className={`grid gap-6 ${vertical ? "md:grid-cols-[260px_1fr]" : "lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]"}`}>
          <div className="flex flex-col gap-3">
            <div
              className={`relative overflow-hidden rounded-xl bg-black/40 ring-1 ring-gold/25 ${
                vertical ? "aspect-[9/16]" : "aspect-video"
              }`}
            >
              {spec.url && (
                // eslint-disable-next-line @next/next/no-img-element -- local file route, already sized
                <img src={spec.url} alt={tt.alt} className={`size-full object-cover ${drawing ? "opacity-40" : ""}`} />
              )}
              {drawing && (
                <span className="absolute inset-0 flex animate-pulse items-center justify-center text-sm text-muted">
                  {tt.drawing}
                </span>
              )}
            </div>
            {spec.url && !drawing && (
              <a href={`${spec.url}&download=${view.fileSlug}-thumbnail`} className={`${buttonClass("primary", "md")} self-start`}>
                <Download /> {tt.download}
              </a>
            )}
            {spec.note && (
              <p className="text-xs text-subtle">
                {tt.fellBack(spec.scene)} <span className="italic">“{spec.note}”</span>
              </p>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted">{tt.text}</span>
              <input
                value={draft.text}
                maxLength={80}
                onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                className={inputClass}
              />
              <span className="text-xs text-subtle">{tt.textHint}</span>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted">{tt.background}</span>
              <select
                value={draft.background === "ai" ? "ai" : String(draft.scene)}
                onChange={(e) =>
                  setDraft(
                    e.target.value === "ai"
                      ? { ...draft, background: "ai" }
                      : { ...draft, background: "scene", scene: Number(e.target.value) },
                  )
                }
                className={inputClass}
              >
                <option value="ai">{tt.aiImage}</option>
                {withKeyframes.map((s) => (
                  <option key={s.id} value={s.index + 1}>
                    {tt.sceneImage(s.index + 1)}
                  </option>
                ))}
              </select>
            </label>
            {draft.background === "ai" && (
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted">{tt.prompt}</span>
                <textarea
                  rows={4}
                  value={draft.prompt}
                  onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
                  className={inputClass}
                />
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy || !draft.text.trim()} onClick={() => onSubmit(draft, false)}>
                <Check /> {tt.apply}
              </Button>
              {draft.background === "ai" && (
                <Button variant="secondary" disabled={busy || !draft.prompt.trim()} onClick={() => onSubmit(draft, true)}>
                  <ImagePlus /> {tt.newImage}
                </Button>
              )}
            </div>
            <p className="text-xs text-subtle">{tt.styleHint}</p>
          </div>
        </div>
      )}
    </Section>
  );
}

type Platform = keyof SocialPosts;
const PLATFORMS: { id: Platform; label: string }[] = [
  { id: "youtube", label: "YouTube" },
  { id: "tiktok", label: "TikTok" },
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
];

function timestamp(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(Math.floor(seconds % 60)).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** The description with chapters, placed above the closing hashtag line when there is one. */
function youtubeDescription({ description, chapters }: SocialPosts["youtube"]) {
  if (chapters.length === 0) return description;
  const list = chapters.map((c) => `${timestamp(c.start)} ${c.title}`).join("\n");
  const lines = description.split("\n");
  const last = lines[lines.length - 1]?.trim() ?? "";
  if (last.startsWith("#") && lines.length > 1) {
    return `${lines.slice(0, -1).join("\n").trimEnd()}\n\n${list}\n\n${last}`;
  }
  return `${description}\n\n${list}`;
}

function PostsPanel({
  view,
  pending,
  onRegenerate,
}: {
  view: ProjectView;
  pending: boolean;
  onRegenerate: () => void;
}) {
  const { t } = useI18n();
  const [platform, setPlatform] = useState<Platform>(view.aspectRatio === "16:9" ? "youtube" : "tiktok");
  const { posts, postsStatus } = view;
  const writing = postsStatus === "writing";

  const fields: { label: string; text: string; limit?: number }[] = [];
  if (posts) {
    if (platform === "youtube") {
      fields.push(
        { label: t.project.posts.title, text: posts.youtube.title, limit: 100 },
        { label: t.project.posts.description, text: youtubeDescription(posts.youtube), limit: 5000 },
        { label: t.project.posts.tags, text: posts.youtube.tags.join(", "), limit: 500 },
      );
    } else {
      fields.push({ label: t.project.posts.caption, text: posts[platform].caption, limit: 2200 });
    }
  }

  return (
    <Section
      icon={<Megaphone />}
      eyebrow={t.project.posts.eyebrow}
      heading={t.project.posts.heading}
      actions={
        !writing && (
          <Button variant="ghost" size="sm" disabled={pending} onClick={onRegenerate}>
            <RotateCcw /> {posts ? t.project.posts.rewrite : t.project.posts.write}
          </Button>
        )
      }
    >

      {writing && <p className="animate-pulse text-sm text-muted">{t.project.posts.writing}</p>}
      {postsStatus === "failed" && view.postsError && <ErrorNote>{view.postsError}</ErrorNote>}
      {!writing && !posts && postsStatus !== "failed" && (
        <p className="text-sm text-muted">{t.project.posts.empty}</p>
      )}

      {posts && (
        <>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => (
              <Button
                key={p.id}
                size="sm"
                variant={platform === p.id ? "primary" : "secondary"}
                onClick={() => setPlatform(p.id)}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <div className={`flex flex-col gap-4 ${writing ? "opacity-50" : ""}`}>
            {fields.map((f) => (
              <CopyField key={`${platform}-${f.label}`} {...f} />
            ))}
          </div>
          <p className="text-xs text-subtle">{t.project.posts.aiLabel}</p>
        </>
      )}
    </Section>
  );
}

function ShortsPanel({
  view,
  pending,
  onCut,
  onSave,
}: {
  view: ProjectView;
  pending: boolean;
  onCut: () => void;
  onSave: (shortId: string, input: ShortInput) => void;
}) {
  const { t } = useI18n();
  const ts = t.project.shorts;
  const picking = view.shortsStatus === "writing";
  const hasShorts = view.shorts.length > 0;

  return (
    <Section
      icon={<Scissors />}
      eyebrow={ts.eyebrow}
      heading={ts.heading}
      actions={
        !picking && (
          <Button variant={hasShorts ? "ghost" : "primary"} size={hasShorts ? "sm" : "md"} disabled={pending} onClick={onCut}>
            {hasShorts ? <RotateCcw /> : <Scissors />} {hasShorts ? ts.recut : ts.cut}
          </Button>
        )
      }
    >
      {!hasShorts && <p className="max-w-2xl text-sm text-muted">{ts.body}</p>}

      {picking && <p className="animate-pulse text-sm text-muted">{ts.picking}</p>}
      {view.shortsStatus === "failed" && view.shortsError && <ErrorNote>{view.shortsError}</ErrorNote>}

      {hasShorts && (
        <>
          <div className={`grid gap-6 md:grid-cols-2 xl:grid-cols-3 ${picking ? "opacity-50" : ""}`}>
            {view.shorts.map((short) => (
              <ShortCard
                key={short.id}
                short={short}
                view={view}
                pending={pending || picking}
                onSave={(input) => onSave(short.id, input)}
              />
            ))}
          </div>
          <p className="text-xs text-subtle">{ts.relatedHint}</p>
        </>
      )}
    </Section>
  );
}

function ShortCard({
  short,
  view,
  pending,
  onSave,
}: {
  short: Short;
  view: ProjectView;
  pending: boolean;
  onSave: (input: ShortInput) => void;
}) {
  const { t } = useI18n();
  const ts = t.project.shorts;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ShortInput>({
    hook: short.hook,
    title: short.title,
    description: short.description,
    fromScene: short.fromScene,
    toScene: short.toScene,
  });
  const rendering = short.status === "rendering";
  const from = Number(draft.fromScene);
  const to = Number(draft.toScene);
  const recut =
    draft.hook.trim() !== short.hook || from !== short.fromScene || to !== short.toScene || short.status === "failed";
  const valid = draft.hook.trim() !== "" && draft.title.trim() !== "" && to >= from;
  const scenes = (
    <span className="text-xs text-subtle">
      {ts.scenes(short.fromScene + 1, short.toScene + 1, (short.toScene - short.fromScene + 1) * view.niche.sceneSeconds)}
    </span>
  );
  const sceneSelect = (key: "fromScene" | "toScene") => (
    <label className="flex flex-1 flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">{key === "fromScene" ? ts.fromScene : ts.toScene}</span>
      <select
        value={String(draft[key])}
        onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}
        className={inputClass}
      >
        {view.scenes.map((s) => (
          <option key={s.id} value={s.index}>
            {s.index + 1}. {s.narration.slice(0, 40)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="relative mx-auto aspect-[9/16] w-full max-w-[280px] overflow-hidden rounded-2xl bg-black ring-1 ring-gold/25">
        {short.videoUrl && (
          <video
            src={short.videoUrl}
            controls
            preload="metadata"
            className={`size-full object-contain ${rendering ? "opacity-30" : ""}`}
          />
        )}
        {rendering && (
          <span className="absolute inset-0 flex animate-pulse items-center justify-center px-4 text-center text-sm text-muted">
            {ts.rendering}
          </span>
        )}
      </div>
      {short.status === "failed" && short.error && <ErrorNote>{short.error}</ErrorNote>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {scenes}
        <div className="flex gap-2">
          {short.videoUrl && !rendering && (
            <a
              href={`${short.videoUrl}&download=${view.fileSlug}-short-${short.index + 1}`}
              className={buttonClass("primary", "sm")}
            >
              <Download /> {ts.download}
            </a>
          )}
          {!editing && (
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => setEditing(true)}>
              <Pencil /> {ts.edit}
            </Button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">{ts.hook}</span>
            <input
              value={draft.hook}
              maxLength={80}
              onChange={(e) => setDraft({ ...draft, hook: e.target.value })}
              className={inputClass}
            />
            <span className="text-xs text-subtle">{ts.hookHint}</span>
          </label>
          <div className="flex gap-2">
            {sceneSelect("fromScene")}
            {sceneSelect("toScene")}
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">{ts.title}</span>
            <input
              value={draft.title}
              maxLength={100}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">{ts.description}</span>
            <textarea
              rows={4}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              className={inputClass}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={pending || !valid}
              onClick={() => {
                onSave(draft);
                setEditing(false);
              }}
            >
              {recut ? <Scissors /> : <Check />} {recut ? ts.save : ts.saveText}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              {ts.cancel}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">{ts.hook}</span>
          <p className="text-sm font-semibold">{short.hook.replace(/\*/g, "")}</p>
        </div>
      )}
      {!editing && (
        <>
          <CopyField label={ts.title} text={short.title} limit={100} />
          <CopyField label={ts.description} text={short.description} limit={5000} />
        </>
      )}
    </div>
  );
}

function CopyField({ label, text, limit }: { label: string; text: string; limit?: number }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const over = limit !== undefined && text.length > limit;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (e.g. insecure origin): the text is still selectable by hand.
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-muted">
          {label}
          {limit !== undefined && (
            <span className={`ml-2 ${over ? "text-danger" : "text-subtle"}`}>
              {text.length}/{limit}
            </span>
          )}
        </span>
        <Button variant="secondary" size="sm" onClick={copy}>
          {copied ? <Check /> : <Copy />} {copied ? t.project.posts.copied : t.project.posts.copy}
        </Button>
      </div>
      <div className={`${inputClass} max-h-72 overflow-y-auto whitespace-pre-wrap select-text`}>{text}</div>
    </div>
  );
}

function SceneCard({
  scene,
  vertical,
  pending,
  onRetry,
  onEdit,
}: {
  scene: Scene;
  vertical: boolean;
  pending: boolean;
  onRetry: (newKeyframe: boolean) => void;
  onEdit: () => void;
}) {
  const { t } = useI18n();
  const working = scene.status === "keyframe" || scene.status === "video";
  const canRetry = scene.status === "failed" || scene.status === "done";

  return (
    <Card
      className={`flex flex-col overflow-hidden transition ${working ? "gold-ring glow-gold" : ""}`}
    >
      <div className={`relative bg-black ${vertical ? "aspect-[9/16]" : "aspect-video"}`}>
        {scene.clipUrl ? (
          <video
            src={scene.clipUrl}
            poster={scene.keyframeUrl ?? undefined}
            preload="metadata"
            controls
            className="size-full object-contain"
          />
        ) : scene.keyframeUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={scene.keyframeUrl} alt="" className="size-full object-contain" />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 bg-gradient-to-b from-[rgb(255_240_214/0.03)] to-transparent text-xs text-subtle">
            <ImageIcon className="size-6" />
            {t.project.noImage}
          </div>
        )}
        <span className="absolute top-2 left-2 rounded-md bg-black/70 px-2 py-0.5 text-[11px] font-bold text-gold-light backdrop-blur">
          {String(scene.index + 1).padStart(2, "0")}
        </span>
        {working && (
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black to-black/0 px-3 pt-8 pb-3 text-xs text-gold-light">
            <span className="size-1.5 animate-ping rounded-full bg-gold" />
            {scene.status === "keyframe" ? t.project.drawing : t.project.filming}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-3.5">
        <StatusBadge status={scene.status} />
        <p className="line-clamp-3 text-xs leading-relaxed text-muted">{scene.narration}</p>
        {isRefusal(scene.error) ? (
          <div className="flex flex-col gap-1 rounded-xl bg-warning/10 p-2.5 text-xs shadow-[inset_0_0_0_1px_rgb(255_200_120/0.2)]">
            <span className="font-semibold text-warning">{t.project.refusedTitle}</span>
            <span className="leading-relaxed text-muted">{t.project.refusedBody}</span>
            <details className="text-subtle">
              <summary className="cursor-pointer">{t.project.refusedReply}</summary>
              <p className="mt-1 leading-relaxed">{refusalReply(scene.error)}</p>
            </details>
          </div>
        ) : (
          scene.error && <p className="line-clamp-3 text-xs text-danger">{scene.error}</p>
        )}
        {canRetry && (
          <div className="mt-auto flex flex-wrap gap-1 pt-1">
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => onRetry(false)}>
              <RotateCcw /> {t.project.redoClip}
            </Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => onRetry(true)}>
              {t.project.redoAll}
            </Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={onEdit}>
              <Pencil /> {t.project.edit}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function SceneEditDialog({
  scene,
  pending,
  onClose,
  onSubmit,
}: {
  scene: Scene;
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: SceneInput, newKeyframe: boolean) => void;
}) {
  const { t } = useI18n();
  const ambient = useContext(AmbientContext);
  const ref = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<SceneInput>({
    narration: scene.narration,
    visualPrompt: scene.visualPrompt,
    camera: scene.camera,
    characterIds: scene.characterIds,
  });
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  // A new cast in the shot needs a new first frame, just like a new visual.
  const visualChanged =
    draft.visualPrompt.trim() !== scene.visualPrompt.trim() ||
    (draft.characterIds ?? []).join() !== scene.characterIds.join();
  const valid = draft.narration.trim() !== "" && draft.visualPrompt.trim() !== "";
  const submit = (newKeyframe: boolean) => {
    onSubmit(draft, newKeyframe);
    ref.current?.close();
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-[min(640px,calc(100vw-2rem))] rounded-3xl bg-[#0b0a12] p-0 text-foreground backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <div className="glass gold-ring flex flex-col gap-5 rounded-3xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">{t.project.editTitle(scene.index + 1)}</h2>
            <p className="text-xs text-subtle">{ambient ? t.project.ambient.editHint : t.project.editHint}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => ref.current?.close()} title={t.project.cancel}>
            <X />
          </Button>
        </div>

        <label className="flex flex-col gap-2">
          <NarrationLabel text={draft.narration} />
          <textarea
            rows={3}
            value={draft.narration}
            onChange={(e) => setDraft((d) => ({ ...d, narration: e.target.value }))}
            className={`${inputClass} text-[15px] leading-relaxed`}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <ImageIcon className="size-3.5 text-gold/80" /> {t.project.visual}
          </span>
          <textarea
            rows={4}
            value={draft.visualPrompt}
            onChange={(e) => setDraft((d) => ({ ...d, visualPrompt: e.target.value }))}
            className={`${inputClass} text-[13px] leading-relaxed`}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <Video className="size-3.5 text-gold/80" /> {t.project.camera}
          </span>
          <input
            value={draft.camera ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, camera: e.target.value }))}
            className={`${inputClass} text-[13px]`}
          />
        </label>
        <SceneCast value={draft.characterIds ?? []} onChange={(characterIds) => setDraft((d) => ({ ...d, characterIds }))} />

        {visualChanged && <p className="text-xs text-gold-light">{t.project.visualChanged}</p>}

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant={visualChanged ? "ghost" : "primary"} disabled={pending || !valid} onClick={() => submit(false)}>
            <RotateCcw /> {t.project.saveClip}
          </Button>
          <Button variant={visualChanged ? "primary" : "secondary"} disabled={pending || !valid} onClick={() => submit(true)}>
            <ImageIcon /> {t.project.saveAll}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
