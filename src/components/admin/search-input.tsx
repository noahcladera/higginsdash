"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";

import { cn } from "@/lib/utils";

/**
 * URL-driven search input. Updates `?q=...&page=1` with a 250ms debounce so
 * typing doesn't spam the server. Used on every admin list page.
 */
export function SearchInput({
  placeholder,
  className,
}: {
  placeholder?: string;
  className?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");
  const [, startTransition] = useTransition();

  // Keep the input in sync when the user navigates (back/forward, filter pills).
  useEffect(() => {
    setValue(params.get("q") ?? "");
  }, [params]);

  useEffect(() => {
    const currentQ = params.get("q") ?? "";
    if (value === currentQ) return;

    const t = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (value) {
        next.set("q", value);
      } else {
        next.delete("q");
      }
      next.delete("page");

      const nextStr = next.toString();
      if (nextStr === params.toString()) return;

      startTransition(() => {
        router.replace(nextStr ? `?${nextStr}` : "?", { scroll: false });
      });
    }, 250);
    return () => clearTimeout(t);
  }, [value, params, router, startTransition]);

  return (
    <Input
      type="search"
      placeholder={placeholder ?? "Search…"}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      className={cn("max-w-sm", className)}
    />
  );
}
