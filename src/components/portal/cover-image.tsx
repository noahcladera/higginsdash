import { cn } from "@/lib/utils";
import { coverImageObjectPosition } from "@/lib/uploads/cover-image-focus";

/**
 * Responsive cover / hero image. Uses plain `<img>` to match the rest of
 * the app (Supabase public URLs, no next/image allowlist).
 */
export function CoverImage({
  src,
  alt,
  className,
  aspect = "16/9",
  focusY,
}: {
  src: string;
  alt: string;
  className?: string;
  aspect?: "16/9" | "16/7" | "4/3" | "1/1";
  /** Vertical crop anchor (0 = top, 50 = center, 100 = bottom). */
  focusY?: number | null;
}) {
  const aspectCls =
    aspect === "16/7"
      ? "aspect-[16/7]"
      : aspect === "4/3"
        ? "aspect-[4/3]"
        : aspect === "1/1"
          ? "aspect-square"
          : "aspect-[16/9]";

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-[var(--radius-lg)] bg-[var(--surface-strong)]",
        aspectCls,
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: coverImageObjectPosition(focusY) }}
      />
    </div>
  );
}
