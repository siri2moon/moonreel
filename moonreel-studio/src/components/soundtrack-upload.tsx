"use client";

import { Music, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { buttonClass } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import { AUDIO_EXTENSIONS } from "@/lib/soundtrack";

export function formatDuration(seconds: number) {
  const s = Math.round(seconds);
  const pad = (n: number) => String(n).padStart(2, "0");
  return s >= 3600
    ? `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
    : `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

type Uploaded = { key: string; duration: number };

/** Streams the file to /api/uploads/audio; XHR rather than fetch for upload progress. */
function upload(file: File, onProgress: (percent: number) => void) {
  return new Promise<Uploaded>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/uploads/audio?name=${encodeURIComponent(file.name)}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let body: Partial<Uploaded> & { error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status === 200 && body.key) resolve({ key: body.key, duration: body.duration ?? 0 });
      else reject(new Error(body.error ?? `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload failed: network error"));
    xhr.send(file);
  });
}

/**
 * Picks and uploads a soundtrack. Inside a form, `name` carries the storage key; the file
 * input itself has no name, so the audio is never posted with the form, and it stays invalid
 * (blocking submit) until the upload has finished.
 */
export function SoundtrackUpload({
  name,
  initialUrl,
  onUploaded,
  disabled,
}: {
  name?: string;
  initialUrl?: string | null;
  onUploaded?: (key: string) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const a = t.newProject.ambient;
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; url: string } | null>(null);
  const [result, setResult] = useState<Uploaded | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const src = file?.url ?? initialUrl ?? null;

  const onPick = async (picked: File | undefined) => {
    const el = input.current;
    if (!picked || !el) return;
    setError(null);
    setResult(null);
    setFile((old) => {
      if (old) URL.revokeObjectURL(old.url);
      return { name: picked.name, url: URL.createObjectURL(picked) };
    });
    setProgress(0);
    el.setCustomValidity(a.notUploaded);
    try {
      const done = await upload(picked, setProgress);
      setResult(done);
      el.setCustomValidity("");
      onUploaded?.(done.key);
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      setError(text);
      el.setCustomValidity(text);
    } finally {
      setProgress(null);
    }
  };

  const uploading = progress !== null;

  return (
    <div className="flex flex-col gap-3">
      {name && <input type="hidden" name={name} value={result?.key ?? ""} />}
      <div className="flex flex-wrap items-center gap-3">
        <label className={`${buttonClass("secondary")} cursor-pointer ${disabled || uploading ? "pointer-events-none opacity-45" : ""}`}>
          <Upload /> {src ? a.replace : a.choose}
          <input
            ref={input}
            type="file"
            accept={[...AUDIO_EXTENSIONS, "audio/*"].join(",")}
            required={!!name}
            disabled={disabled || uploading}
            onChange={(e) => onPick(e.target.files?.[0])}
            className="sr-only"
          />
        </label>
        {file && (
          <span className="flex min-w-0 items-center gap-2 text-sm">
            <Music className="size-4 shrink-0 text-gold" />
            <span className="truncate">{file.name}</span>
            {result && <span className="text-xs text-subtle">· {formatDuration(result.duration)}</span>}
          </span>
        )}
      </div>
      {uploading && (
        <div className="flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[rgb(255_240_214/0.08)]">
            <div className="h-full rounded-full bg-gold transition-[width]" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs text-muted">{a.uploading(progress)}</span>
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
      {src && <audio controls preload="metadata" src={src} className="w-full" />}
      {!file && <p className="text-xs text-subtle">{a.formats}</p>}
    </div>
  );
}
