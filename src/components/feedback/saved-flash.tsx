"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { SAVED_FLASH_PARAM } from "@/lib/feedback/saved-flash";

/**
 * One-time "Saved" toast after server redirects with `?saved=1`.
 * Mount once in the admin layout.
 */
export function SavedFlash() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    if (searchParams.get(SAVED_FLASH_PARAM) !== "1") return;
    handled.current = true;

    toast.success("Saved");

    const next = new URLSearchParams(searchParams.toString());
    next.delete(SAVED_FLASH_PARAM);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [pathname, router, searchParams]);

  return null;
}
