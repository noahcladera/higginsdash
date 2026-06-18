"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { uploadImage, type ImageUploadKind } from "@/lib/uploads/image-upload";
import { listStockMedia, type StockMediaItem } from "@/lib/uploads/stock-media";
import { cn } from "@/lib/utils";

/**
 * ImageUpload — the single client-side upload surface for every image
 * field (org logo, program / class-series cover, coach photo).
 *
 * Behaviour that matters for parents using this in the wild:
 *
 *   - Drag-and-drop OR click the tile OR tap on mobile — all three
 *     open the same file picker.
 *   - Preview renders as soon as a file is chosen so the user sees
 *     what they're about to upload before committing.
 *   - "Remove" explicitly clears the value to empty string, which is
 *     what the server treats as "no image". We do NOT actually delete
 *     the blob from storage — it's unreferenced and cheap.
 *   - Progress / error state is inline (no toasts) so the flow feels
 *     like a form field, not a side channel.
 *
 * The parent form submits the final URL via a hidden input (`name`
 * prop) so regular FormData-based server actions can consume it
 * without any JS glue.
 */
export type ImageAspect = "square" | "16/9" | "4/3";

export interface ImageUploadProps {
  /** Hidden input name — what the URL is submitted as in the form. */
  name: string;
  /** Current image URL. Empty string = no image yet. */
  defaultUrl?: string | null;
  /** Upload category; determines resize bounds + storage folder. */
  kind: ImageUploadKind;
  /** Aspect ratio used for the preview tile. Defaults based on `kind`. */
  aspect?: ImageAspect;
  /** Visible label shown above the field. */
  label: string;
  /** One-sentence sub-label explaining what this image will be used for. */
  helpText?: string;
  /** Fires whenever the URL changes (upload succeeds, or removal). */
  onChange?: (url: string) => void;
  /**
   * Show the curated stock photo grid below the upload tile.
   * Defaults to true for logo/cover; false for personal profile photos.
   */
  showStockPicker?: boolean;
  className?: string;
}

const ASPECT_CLASS: Record<ImageAspect, string> = {
  square: "aspect-square",
  "16/9": "aspect-[16/9]",
  "4/3": "aspect-[4/3]",
};

const DEFAULT_ASPECT_BY_KIND: Record<ImageUploadKind, ImageAspect> = {
  logo: "square",
  cover: "16/9",
  photo: "square",
};

export function ImageUpload({
  name,
  defaultUrl,
  kind,
  aspect,
  label,
  helpText,
  onChange,
  showStockPicker,
  className,
}: ImageUploadProps) {
  const [url, setUrl] = React.useState<string>(defaultUrl ?? "");
  const [stockPhotos, setStockPhotos] = React.useState<StockMediaItem[]>([]);
  const [stockStatus, setStockStatus] = React.useState<
    "idle" | "loading" | "error"
  >("idle");
  const [status, setStatus] = React.useState<
    | { kind: "idle" }
    | { kind: "uploading" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [dragActive, setDragActive] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const resolvedAspect = aspect ?? DEFAULT_ASPECT_BY_KIND[kind];
  const resolvedShowStockPicker =
    showStockPicker ?? (kind === "logo" || kind === "cover");

  React.useEffect(() => {
    if (!resolvedShowStockPicker) return;
    let cancelled = false;
    setStockStatus("loading");
    listStockMedia()
      .then((photos) => {
        if (!cancelled) {
          setStockPhotos(photos);
          setStockStatus("idle");
        }
      })
      .catch(() => {
        if (!cancelled) setStockStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [resolvedShowStockPicker]);

  function setValue(nextUrl: string) {
    setUrl(nextUrl);
    onChange?.(nextUrl);
  }

  async function handleFile(file: File) {
    setStatus({ kind: "uploading" });
    const formData = new FormData();
    formData.set("file", file);
    formData.set("kind", kind);
    try {
      const result = await uploadImage(formData);
      if (result.ok) {
        setValue(result.url);
        setStatus({ kind: "idle" });
      } else {
        setStatus({ kind: "error", message: result.error });
      }
    } catch {
      setStatus({
        kind: "error",
        message: "Upload failed. Check your connection and try again.",
      });
    }
  }

  function openFilePicker() {
    inputRef.current?.click();
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    // Reset so choosing the same file again re-triggers onChange.
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  const inputId = `image-upload-${name}`;
  const isUploading = status.kind === "uploading";

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={inputId}>{label}</Label>
      {helpText && (
        <p className="text-xs text-[var(--muted-foreground)]">{helpText}</p>
      )}

      <div
        className={cn(
          "relative flex w-full max-w-md flex-col overflow-hidden rounded-[var(--radius-lg)] border border-dashed transition-colors",
          dragActive
            ? "border-[var(--ring)] bg-[var(--surface-strong)]"
            : "border-[var(--border)] bg-[var(--surface)]",
          isUploading && "opacity-70",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
      >
        {url ? (
          <div className={cn("relative w-full", ASPECT_CLASS[resolvedAspect])}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={label}
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={openFilePicker}
            className={cn(
              "flex w-full flex-col items-center justify-center gap-2 px-6 py-10 text-center text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-strong)]",
              ASPECT_CLASS[resolvedAspect],
            )}
            disabled={isUploading}
          >
            <span className="font-medium text-[var(--foreground)]">
              {isUploading ? "Uploading…" : "Click to upload or drop a file"}
            </span>
            <span className="text-xs">
              PNG, JPG, or WebP · up to 8MB
            </span>
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={openFilePicker}
          disabled={isUploading}
        >
          {url ? "Replace image" : "Choose image"}
        </Button>
        {url && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setValue("")}
            disabled={isUploading}
          >
            Remove
          </Button>
        )}
        {isUploading && (
          <span className="text-xs text-[var(--muted-foreground)]">
            Uploading…
          </span>
        )}
      </div>

      {status.kind === "error" && (
        <p className="text-sm text-[var(--destructive)]">{status.message}</p>
      )}

      {resolvedShowStockPicker && stockPhotos.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-[var(--muted-foreground)]">
            Or pick a stock photo
          </p>
          <div className="grid max-h-48 max-w-md grid-cols-4 gap-2 overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-2">
            {stockPhotos.map((photo) => {
              const selected = url === photo.url;
              return (
                <button
                  key={photo.id}
                  type="button"
                  title={photo.title}
                  onClick={() => setValue(photo.url)}
                  disabled={isUploading}
                  className={cn(
                    "relative aspect-square overflow-hidden rounded-md border transition-colors",
                    selected
                      ? "border-[var(--ring)] ring-2 ring-[var(--ring)]"
                      : "border-[var(--border)] hover:border-[var(--ring)]",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={photo.title}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}
      {resolvedShowStockPicker && stockStatus === "loading" && (
        <p className="text-xs text-[var(--muted-foreground)]">
          Loading stock photos…
        </p>
      )}

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={onInputChange}
        disabled={isUploading}
      />
      <input type="hidden" name={name} value={url} />
    </div>
  );
}
