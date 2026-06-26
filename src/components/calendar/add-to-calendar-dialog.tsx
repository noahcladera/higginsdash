"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import type { CalendarFeedScope } from "@prisma/client";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AppleCalendarIcon,
  CalendarBrandCluster,
  GoogleCalendarIcon,
} from "@/components/calendar/calendar-brand-icons";
import {
  calendarFeedHttpsUrl,
  calendarFeedWebcalUrl,
  googleCalendarSubscribeUrl,
} from "@/lib/calendar/subscribe-urls";
import {
  ensureCalendarFeedToken,
  revokeCalendarFeedToken,
} from "@/lib/portal/calendar-feed-actions";
import { cn } from "@/lib/utils";

export interface CalendarTokenSummary {
  id: string;
  scope: CalendarFeedScope;
}

type AddToCalendarVariant = "member" | "coach";

export function AddToCalendarDialog({
  origin,
  hasHousehold,
  allowedScopes = ["self", "household"],
  defaultScope,
  initialTokens,
  variant = "member",
  trigger,
}: {
  origin: string;
  hasHousehold: boolean;
  allowedScopes?: CalendarFeedScope[];
  defaultScope?: CalendarFeedScope;
  initialTokens: CalendarTokenSummary[];
  variant?: AddToCalendarVariant;
  trigger?: ReactNode;
}) {
  const resolvedDefaultScope = useMemo(() => {
    if (defaultScope && allowedScopes.includes(defaultScope)) {
      return defaultScope;
    }
    if (hasHousehold && allowedScopes.includes("household")) {
      return "household";
    }
    if (allowedScopes.includes("self")) return "self";
    return allowedScopes[0] ?? "self";
  }, [allowedScopes, defaultScope, hasHousehold]);

  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<CalendarFeedScope>(resolvedDefaultScope);
  const [tokens, setTokens] = useState(initialTokens);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const showScopeToggle =
    variant === "member" &&
    hasHousehold &&
    allowedScopes.includes("self") &&
    allowedScopes.includes("household");

  const activeTokenForScope = tokens.find((t) => t.scope === scope);

  const description =
    variant === "coach"
      ? "Subscribe once — your teaching schedule updates automatically when sessions change. This is not a one-time download."
      : "Subscribe once — new classes and court bookings appear automatically. This is not a one-time download.";

  function subscribe(platform: "google" | "apple") {
    setError(null);
    startTransition(async () => {
      const res = await ensureCalendarFeedToken({ scope });
      if (!res.ok) {
        setError(res.error);
        return;
      }

      if (res.created) {
        setTokens((prev) => [...prev, { id: res.id, scope }]);
      }

      const httpsUrl = calendarFeedHttpsUrl(origin, res.token);
      const url =
        platform === "google"
          ? googleCalendarSubscribeUrl(httpsUrl)
          : calendarFeedWebcalUrl(httpsUrl);

      window.open(url, "_blank", "noopener,noreferrer");

      toast.success("Calendar linked", {
        description: "Your schedule updates automatically as things change.",
      });
      setOpen(false);
    });
  }

  function handleRevoke() {
    const token = activeTokenForScope;
    if (!token) return;

    setError(null);
    startTransition(async () => {
      const res = await revokeCalendarFeedToken({ id: token.id });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTokens((prev) => prev.filter((t) => t.id !== token.id));
      toast.success("Calendar subscription removed");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            className={cn(
              "inline-flex h-8 items-center gap-2 rounded-full border border-[var(--triaz-ink)]/25",
              "bg-[var(--triaz-ink)]/12 px-3 text-xs font-medium text-[var(--triaz-ink)]",
              "shadow-[var(--shadow-sm)] transition-all duration-150",
              "hover:border-[var(--triaz-ink)]/40 hover:bg-[var(--triaz-ink)]/18 hover:shadow-[var(--shadow-md)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2",
              "active:scale-[0.98]",
            )}
          >
            <CalendarBrandCluster />
            Add to calendar
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add to calendar</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {showScopeToggle && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              Include
            </p>
            <div className="flex gap-2">
              <ScopeOption
                active={scope === "household"}
                label="Whole household"
                onClick={() => setScope("household")}
              />
              <ScopeOption
                active={scope === "self"}
                label="Just my classes"
                onClick={() => setScope("self")}
              />
            </div>
          </div>
        )}

        <div className="grid gap-2">
          <Button
            type="button"
            tone="triaz"
            className="w-full justify-start gap-3 px-4"
            disabled={pending}
            onClick={() => subscribe("google")}
          >
            <GoogleCalendarIcon size={20} className="!size-5 shrink-0" />
            {activeTokenForScope
              ? "Open in Google Calendar"
              : "Add to Google Calendar"}
          </Button>
          <Button
            type="button"
            variant="outline"
            tone="triaz"
            className="w-full justify-start gap-3 border-[var(--border-strong)] bg-[var(--surface)] px-4 hover:bg-[var(--surface-strong)]"
            disabled={pending}
            onClick={() => subscribe("apple")}
          >
            <AppleCalendarIcon size={20} className="!size-5 shrink-0" />
            {activeTokenForScope
              ? "Open in Apple Calendar"
              : "Add to Apple Calendar"}
          </Button>
        </div>

        <p className="text-xs text-[var(--muted-foreground)]">
          Google and Apple check this link every few hours. When you enroll,
          book a court, or the schedule changes, it shows up automatically —
          no new download needed.
        </p>

        {activeTokenForScope && (
          <button
            type="button"
            className="text-xs text-[var(--muted-foreground)] underline-offset-2 hover:text-[var(--destructive)] hover:underline disabled:opacity-50"
            disabled={pending}
            onClick={handleRevoke}
          >
            Remove subscription
          </button>
        )}

        {error && (
          <p className="text-sm text-[var(--destructive)]">{error}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ScopeOption({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-[var(--radius-md)] border px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "border-[var(--triaz-ink)] bg-[var(--triaz-ink)]/10 text-[var(--foreground)]"
          : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] hover:border-[var(--border-strong)] hover:text-[var(--foreground)]",
      )}
    >
      {label}
    </button>
  );
}
