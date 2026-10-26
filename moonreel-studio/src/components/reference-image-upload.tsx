"use client";

import { ImagePlus, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button, buttonClass } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import { REFERENCE_EXTENSIONS } from "@/lib/reference-image";

async function upload(file: File) {
  const res = await fetch(`/api/uploads/image?name=${encodeURIComponent(file.name)}`, { method: "POST", body: file });
  const body = (await res.json().catch(() => ({}))) as { key?: string; error?: string };
  if (!res.ok || !body.key) throw new Error(body.error ?? `Upload failed (${res.status})`);
  return body.key;
}

/**
 * Optional photo of the place. Inside a form, `name` carries the storage key; `onChange`
 * reports a new key, or null when the photo is removed.
 */
export function ReferenceImageUpload({
  name,
  initialUrl,
  onChange,
  disabled,
}: {
  name?: string;
  initialUrl?: string | null;
  onChange?: (key: string | null) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const r = t.newProject.reference;
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(initialUrl ?? null);
  const [key, setKey] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPick = async (file: File | undefined) => {
    const el = input.current;
    if (!file || !el) return;
    setError(null);
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    el.setCustomValidity(r.uploading);
    try {
      const uploaded = await upload(file);
      setKey(uploaded);
      el.setCustomValidity("");
      onChange?.(uploaded);
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      setError(text);
      setPreview(initialUrl ?? null);
      el.setCustomValidity("");
      el.value = "";
    } finally {
      setUploading(false);
    }
  };

  const remove = () => {
    if (input.current) input.current.value = "";
    setPreview(null);
    setKey("");
    onChange?.(null);
  };

  return (
    <div className="flex flex-col gap-3">
      {name && <input type="hidden" name={name} value={key} />}
      {preview && (
        <div className="relative self-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt={r.alt}
            className={`max-h-56 rounded-2xl object-cover ring-1 ring-gold/25 ${uploading ? "animate-pulse opacity-60" : ""}`}
          />
          <Button
            variant="secondary"
            size="icon"
            onClick={remove}
            disabled={disabled || uploading}
            title={r.remove}
            className="absolute top-2 right-2"
          >
            <X />
          </Button>
        </div>
      )}
      <label className={`${buttonClass("secondary")} cursor-pointer self-start ${disabled || uploading ? "pointer-events-none opacity-45" : ""}`}>
        <ImagePlus /> {uploading ? r.uploading : preview ? r.replace : r.choose}
        <input
          ref={input}
          type="file"
          accept={REFERENCE_EXTENSIONS.join(",")}
          disabled={disabled || uploading}
          onChange={(e) => onPick(e.target.files?.[0])}
          className="sr-only"
        />
      </label>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
