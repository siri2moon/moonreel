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
  regenerateScript,
  rerender,
  retryScenes,
  saveScript,
  type SceneInput,
} from "@/app/actions";
import { Button, buttonClass, Card, ErrorNote, inputClass, StatusBadge } from "@/components/ui";
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
            <RotateCcw /> Viết lại kịch bản
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
            <span className="text-muted">Chủ đề:</span> {view.topic}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="hover:text-danger"
          disabled={pending}
          onClick={() => confirm("Xoá video này?") && onDelete()}
        >
          <Trash /> Xoá
        </Button>
      </div>
    </div>
  );
}

const STEPS = [
  { key: "script", label: "Kịch bản", Icon: Sparkles },
  { key: "review", label: "Duyệt", Icon: Check },
  { key: "produce", label: "Sản xuất", Icon: Clapperboard },
  { key: "render", label: "Ghép video", Icon: Film },
  { key: "done", label: "Hoàn thành", Icon: Download },
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
  const at = currentStep(view, editable);
  const failed = view.status === "failed";
  return (
    <ol className="glass flex items-center gap-2 overflow-x-auto rounded-2xl p-3">
      {STEPS.map(({ key, label, Icon }, i) => {
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
              {label}
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
        <h2 className="text-lg font-semibold">Muse đang viết kịch bản…</h2>
        <p className="text-sm text-muted">Thường mất 1–3 phút. Trang tự cập nhật khi xong, bạn không cần tải lại.</p>
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
          <span className="font-semibold">Kịch bản</span>
          <span className="text-muted">
            {" "}
            · {draft.length} cảnh · ~{draft.length * sceneSeconds}s
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" disabled={pending} onClick={props.onRegenerate}>
            <RotateCcw /> Viết lại
          </Button>
          <Button variant="secondary" size="sm" disabled={pending} onClick={props.onSave}>
            <Save /> Lưu nháp
          </Button>
          <Button disabled={pending || draft.length === 0} onClick={props.onApprove}>
            <Check /> Duyệt & sản xuất
          </Button>
        </div>
      </div>

      <Card className="p-5">
        <label className="flex flex-col gap-2">
          <span className="text-[11px] font-semibold tracking-[0.2em] text-subtle uppercase">Tiêu đề video</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-transparent text-xl font-bold tracking-tight outline-none placeholder:text-subtle"
            placeholder="Tiêu đề video"
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
                  <Button variant="ghost" size="icon" onClick={() => move(i, -1)} disabled={i === 0} title="Lên">
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => move(i, 1)}
                    disabled={i === draft.length - 1}
                    title="Xuống"
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="hover:text-danger"
                    onClick={() => remove(i)}
                    title="Xoá cảnh"
                  >
                    <X />
                  </Button>
                </div>
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-4">
                <label className="flex flex-col gap-2">
                  <span className="flex items-center justify-between text-xs text-muted">
                    <span className="flex items-center gap-1.5">
                      <Mic className="size-3.5 text-gold/80" /> Lời thoại
                    </span>
                    <span className={words > 25 ? "text-warning" : "text-subtle"}>{words}/25 từ</span>
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
                      <ImageIcon className="size-3.5 text-gold/80" /> Mô tả hình ảnh (tiếng Anh)
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
                      <Video className="size-3.5 text-gold/80" /> Camera
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
        <Plus className="size-4" /> Thêm cảnh
      </button>
    </div>
  );
}

function Production({
  view,
  pending,
  onRetry,
  onRender,
}: {
  view: ProjectView;
  pending: boolean;
  onRetry: (ids: string[], newKeyframe: boolean) => void;
  onRender: () => void;
}) {
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
                <Sparkles className="size-3.5" /> Thành phẩm
              </span>
              <h2 className="text-2xl font-bold tracking-tight">Video đã sẵn sàng để đăng</h2>
              <p className="text-sm text-muted">
                {total} cảnh · {view.aspectRatio} · phụ đề nhúng (bật/tắt trong trình phát) và file .srt riêng.
              </p>
              <div className="flex flex-wrap gap-2">
                <a href={`${view.finalVideoUrl}&download`} className={buttonClass("primary", "lg")}>
                  <Download /> Tải MP4
                </a>
                {view.captionsUrl && (
                  <a href={`${view.captionsUrl}&download`} className={buttonClass("secondary", "lg")}>
                    <Captions /> Phụ đề .srt
                  </a>
                )}
              </div>
              <Button variant="ghost" size="sm" disabled={pending} onClick={onRender} className="self-start">
                <RotateCcw /> Ghép lại
              </Button>
            </div>
          </div>
        </Card>
      )}

      <section className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold tracking-tight">Sản xuất từng cảnh</h2>
            <span className="text-xs text-muted">
              {done}/{total} cảnh xong · {percent}%
            </span>
          </div>
          <div className="flex gap-2">
            {failed.length > 0 && (
              <Button variant="secondary" disabled={pending} onClick={() => onRetry(failed.map((s) => s.id), false)}>
                <RotateCcw /> Thử lại {failed.length} cảnh lỗi
              </Button>
            )}
            {allDone && view.status !== "rendering" && view.status !== "done" && (
              <Button disabled={pending} onClick={onRender}>
                <Film /> Ghép video
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
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function SceneCard({
  scene,
  vertical,
  pending,
  onRetry,
}: {
  scene: Scene;
  vertical: boolean;
  pending: boolean;
  onRetry: (newKeyframe: boolean) => void;
}) {
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
            Chưa có hình
          </div>
        )}
        <span className="absolute top-2 left-2 rounded-md bg-black/70 px-2 py-0.5 text-[11px] font-bold text-gold-light backdrop-blur">
          {String(scene.index + 1).padStart(2, "0")}
        </span>
        {working && (
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black to-black/0 px-3 pt-8 pb-3 text-xs text-gold-light">
            <span className="size-1.5 animate-ping rounded-full bg-gold" />
            {scene.status === "keyframe" ? "Muse đang vẽ khung hình…" : "Muse đang tạo clip…"}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-3.5">
        <StatusBadge status={scene.status} />
        <p className="line-clamp-3 text-xs leading-relaxed text-muted">{scene.narration}</p>
        {scene.error && <p className="line-clamp-3 text-xs text-danger">{scene.error}</p>}
        {canRetry && (
          <div className="mt-auto flex flex-wrap gap-1 pt-1">
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => onRetry(false)}>
              <RotateCcw /> Làm lại clip
            </Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => onRetry(true)}>
              Cả ảnh
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
