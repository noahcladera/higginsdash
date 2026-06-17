"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyableText({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setError(null);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to clipboard.");
    }
  }

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-[var(--border)] bg-[var(--muted)]/30 p-3 text-xs break-all font-mono">
        {value}
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={handleCopy}>
          {copied ? "Copied" : label}
        </Button>
        {error && (
          <span className="text-xs text-[var(--destructive)]">{error}</span>
        )}
      </div>
    </div>
  );
}
