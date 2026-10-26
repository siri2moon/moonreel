"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Captions,
  Check,
  Clapperboard,
  Download,
  Film,
  Image as ImageIcon,
  Mic,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Trash,
  Video,
  WandSparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  approveAndProduce,
  deleteProject,
  editScene,
  regenerateScript,
  rerender,
  retryScenes,
  saveScript,
  type SceneInput,
} from "@/app/actions";
import { StatusBadge } from "@/components/status-badge";
import { Button, buttonClass, Card, ErrorNote, inputClass } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import { isRefusal, refusalReply } from "@/lib/scene-errors";
import type { ProjectView } from "@/lib/views";

const BUSY = new Set(["scripting", "producing", "rendering"]);
const POLL_MS = 3_000;

type Scene = ProjectView["scenes"][number];

function toDraft(scenes: Scene[]): SceneInput[] {
  return scenes.map(({ narration, visualPrompt, camera }) => ({ narration, visualPrompt, camera }));
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
    if (!BUSY.has(view.status)) return;
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
  }, [view.id, view.status]);

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

  return (
    <div className="flex flex-col gap-8">
      <Header view={view} onDelete={() => run(() => deleteProject(view.id))} pending={pending} />
      <Stepper view={view} editable={editable} />

      {(view.error || actionError) && <ErrorNote>{actionError ?? view.error}</ErrorNote>}

      {view.status === "scripting" && <Writing />}

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
          onEdit={(sceneId, input, newKeyframe) =>
            run(() => editScene(view.id, sceneId, input, { newKeyframe }), { status: "producing", error: null })
          }
        />
      )}
    </div>
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
            {view.character && (
              <span className="flex items-center gap-1.5 rounded-full frost py-0.5 pr-2.5 pl-0.5">
                {view.character.referenceUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={view.character.referenceUrl} alt="" className="size-5 rounded-full object-cover" />
                ) : (
                  <span className="size-5 rounded-full bg-gold/20" />
                )}
                {view.character.name}
              </span>
            )}
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
  return (
    <Card className="gold-ring relative flex flex-col items-center gap-5 overflow-hidden px-6 py-16 text-center">
      <div className="pointer-events-none absolute top-1/2 left-1/2 size-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold/10 blur-[80px]" />
      <span className="relative flex size-16 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-gold/20" />
        <span className="bg-gold relative flex size-14 items-center justify-center rounded-full text-[#21180a]">
          <WandSparkles className="size-6" />
        </span>
      </span>
      <div className="relative flex flex-col gap-1.5">
        <h2 className="text-lg font-semibold">{t.project.writingTitle}</h2>
        <p className="text-sm text-muted">{t.project.writingBody}</p>
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
  const add = () => setDraft((d) => [...d, { narration: "", visualPrompt: "", camera: "static medium shot" }]);

  return (
    <div className="flex flex-col gap-5">
      <div className="glass sticky top-[7.5rem] z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl p-3 pl-5 lg:top-4">
        <div className="text-sm">
          <span className="font-semibold">{t.project.script}</span>
          <span className="text-muted">{t.project.scriptSummary(draft.length, draft.length * sceneSeconds)}</span>
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
          const words = scene.narration.trim().split(/\s+/).filter(Boolean).length;
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
                  <span className="flex items-center justify-between text-xs text-muted">
                    <span className="flex items-center gap-1.5">
                      <Mic className="size-3.5 text-gold/80" /> {t.project.narration}
                    </span>
                    <span className={words > 25 ? "text-warning" : "text-subtle"}>{t.project.words(words)}</span>
                  </span>
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
  onEdit,
}: {
  view: ProjectView;
  pending: boolean;
  onRetry: (ids: string[], newKeyframe: boolean) => void;
  onRender: () => void;
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
      {view.finalVideoUrl && view.status === "done" && (
        <Card className="gold-ring relative overflow-hidden p-5 md:p-8">
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
              <span className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.2em] text-gold uppercase">
                <Sparkles className="size-3.5" /> {t.project.final}
              </span>
              <h2 className="text-2xl font-bold tracking-tight">{t.project.finalTitle}</h2>
              <p className="text-sm text-muted">{t.project.finalBody(total, view.aspectRatio)}</p>
              <div className="flex flex-wrap gap-2">
                <a href={`${view.finalVideoUrl}&download`} className={buttonClass("primary", "lg")}>
                  <Download /> {t.project.downloadMp4}
                </a>
                {view.captionsUrl && (
                  <a href={`${view.captionsUrl}&download`} className={buttonClass("secondary", "lg")}>
                    <Captions /> {t.project.downloadSrt}
                  </a>
                )}
              </div>
              <Button variant="ghost" size="sm" disabled={pending} onClick={onRender} className="self-start">
                <RotateCcw /> {t.project.rerender}
              </Button>
            </div>
          </div>
        </Card>
      )}

      <section className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold tracking-tight">{t.project.productionTitle}</h2>
            <span className="text-xs text-muted">{t.project.progress(done, total, percent)}</span>
          </div>
          <div className="flex gap-2">
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
          </div>
        </div>

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
      </section>

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
  const ref = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<SceneInput>({
    narration: scene.narration,
    visualPrompt: scene.visualPrompt,
    camera: scene.camera,
  });
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const words = draft.narration.trim().split(/\s+/).filter(Boolean).length;
  const visualChanged = draft.visualPrompt.trim() !== scene.visualPrompt.trim();
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
            <p className="text-xs text-subtle">{t.project.editHint}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => ref.current?.close()} title={t.project.cancel}>
            <X />
          </Button>
        </div>

        <label className="flex flex-col gap-2">
          <span className="flex items-center justify-between text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <Mic className="size-3.5 text-gold/80" /> {t.project.narration}
            </span>
            <span className={words > 25 ? "text-warning" : "text-subtle"}>{t.project.words(words)}</span>
          </span>
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
