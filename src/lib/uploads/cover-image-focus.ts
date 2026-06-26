export const DEFAULT_COVER_IMAGE_FOCUS_Y = 50;

export function clampCoverImageFocusY(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function coverImageObjectPosition(focusY?: number | null): string {
  return `center ${clampCoverImageFocusY(focusY ?? DEFAULT_COVER_IMAGE_FOCUS_Y)}%`;
}

/** Focus Y for a series cover, falling back to the program when unset. */
export function resolveCoverImageFocusY(args: {
  seriesCoverUrl: string | null | undefined;
  seriesFocusY: number | null | undefined;
  programFocusY: number | null | undefined;
}): number {
  const raw = args.seriesCoverUrl ? args.seriesFocusY : args.programFocusY;
  return clampCoverImageFocusY(raw ?? DEFAULT_COVER_IMAGE_FOCUS_Y);
}
