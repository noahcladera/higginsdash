"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";

/**
 * URL-driven search input. Updates `?q=...&page=1` with a 250ms debounce so
 * typing doesn't spam the server. Used on every admin list page.
 */
export function SearchInput({ placeholder }: { placeholder?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");
  const [, startTransition] = useTransition();

  useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (value) {
        next.set("q", value);
      } else {
        next.delete("q");
      }
      next.delete("page");
      startTransition(() => {
        router.replace(`?${next.toString()}`);
      });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Input
      type="search"
      placeholder={placeholder ?? "Search…"}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      className="max-w-sm"
    />
  );
}
