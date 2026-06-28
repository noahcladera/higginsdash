"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import type { CalendarFeedScope } from "@prisma/client";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useOverlay } from "@/components/ui/overlay-provider";
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

type FeedUrls = {
  httpsUrl: string;
  webcalUrl: string;
  googleUrl: string;
};

type FeedFallback = {
  httpsUrl: string;
  webcalUrl: string;
  platform: "google" | "apple";
};

export function AddToCalendarDialog({
  origin,
  hasHousehold,
  allowedScopes = ["self", "household"],
  defaultScope,
  initialTokens,
  variant = "member",
  trigger,
  rendersSheet = true,
}: {
  origin: string;
  hasHousehold: boolean;
  allowedScopes?: CalendarFeedScope[];
  defaultScope?: CalendarFeedScope;
  initialTokens: CalendarTokenSummary[];
  variant?: AddToCalendarVariant;
  trigger?: ReactNode;
  /** When false, only the trigger renders — used for duplicate desktop/mobile instances. */
  rendersSheet?: boolean;
}) {
  const { open: sheetVisible, openSheet, closeSheet } = useOverlay(
    "add-to-calendar",
  );
  const [scope, setScope] = useState<CalendarFeedScope>(() => {
    if (defaultScope && allowedScopes.includes(defaultScope)) {
      return defaultScope;
    }
    if (hasHousehold && allowedScopes.includes("household")) {
      return "household";
    }
    if (allowedScopes.includes("self")) return "self";
    return allowedScopes[0] ?? "self";
  });
  const [tokens, setTokens] = useState(initialTokens);
  const [pending, startTransition] = useTransition();
  const [prefetching, setPrefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedCache, setFeedCache] = useState<Partial<Record<CalendarFeedScope, FeedUrls>>>(
    {},
  );
  const [feedFallback, setFeedFallback] = useState<FeedFallback | null>(null);

  // Clear the pop-up-blocked fallback panel whenever the sheet closes.
  useEffect(() => {
    if (!sheetVisible) setFeedFallback(null);
  }, [sheetVisible]);

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

  useEffect(() => {
    if (!sheetVisible) return;
    let cancelled = false;
    setPrefetching(true);
    setError(null);

    void (async () => {
      const res = await ensureCalendarFeedToken({ scope });
      if (cancelled) return;
      if (!res.ok) {
        setError(res.error);
        setPrefetching(false);
        return;
      }
      if (res.created) {
        setTokens((prev) => [...prev, { id: res.id, scope }]);
      }
      const httpsUrl = calendarFeedHttpsUrl(origin, res.token);
      setFeedCache((prev) => ({
        ...prev,
        [scope]: {
          httpsUrl,
          webcalUrl: calendarFeedWebcalUrl(httpsUrl),
          googleUrl: googleCalendarSubscribeUrl(httpsUrl),
        },
      }));
      setPrefetching(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [sheetVisible, scope, origin]);

  function navigateToFeed(platform: "google" | "apple", urls: FeedUrls): boolean {
    const popup = window.open("about:blank", "_blank");
    const url = platform === "google" ? urls.googleUrl : urls.webcalUrl;

    if (popup && !popup.closed) {
      try {
        popup.location.href = url;
        return true;
      } catch {
        popup.close();
      }
    }

    setFeedFallback({
      httpsUrl: urls.httpsUrl,
      webcalUrl: urls.webcalUrl,
      platform,
    });
    return false;
  }

  function subscribe(platform: "google" | "apple") {
    setError(null);
    setFeedFallback(null);

    const cached = feedCache[scope];
    if (cached) {
      if (navigateToFeed(platform, cached)) {
        toast.success("Calendar linked", {
          description: "Your schedule updates automatically as things change.",
        });
        closeSheet();
      }
      return;
    }

    const popup = window.open("about:blank", "_blank");

    startTransition(async () => {
      const res = await ensureCalendarFeedToken({ scope });
      if (!res.ok) {
        popup?.close();
        setError(res.error);
        return;
      }

      if (res.created) {
        setTokens((prev) => [...prev, { id: res.id, scope }]);
      }

      const httpsUrl = calendarFeedHttpsUrl(origin, res.token);
      const urls: FeedUrls = {
        httpsUrl,
        webcalUrl: calendarFeedWebcalUrl(httpsUrl),
        googleUrl: googleCalendarSubscribeUrl(httpsUrl),
      };
      setFeedCache((prev) => ({ ...prev, [scope]: urls }));

      const url = platform === "google" ? urls.googleUrl : urls.webcalUrl;

      if (popup && !popup.closed) {
        try {
          popup.location.href = url;
          toast.success("Calendar linked", {
            description: "Your schedule updates automatically as things change.",
          });
          closeSheet();
          return;
        } catch {
          popup.close();
        }
      }

      setFeedFallback({ httpsUrl, webcalUrl: urls.webcalUrl, platform });
    });
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Could not copy — select and copy the ${label.toLowerCase()} manually`);
    }
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
      setFeedCache((prev) => {
        const next = { ...prev };
        delete next[scope];
        return next;
      });
      toast.success("Calendar subscription removed");
    });
  }

  const busy = pending || prefetching;

  const panelBody = (
    <>
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
          disabled={busy}
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
          disabled={busy}
          onClick={() => subscribe("apple")}
        >
          <AppleCalendarIcon size={20} className="!size-5 shrink-0" />
          {activeTokenForScope
            ? "Open in Apple Calendar"
            : "Add to Apple Calendar"}
        </Button>
      </div>

      {feedFallback && (
        <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]/30 p-3">
          <p className="text-xs text-[var(--muted-foreground)]">
            {feedFallback.platform === "google"
              ? "Pop-up blocked — copy this link and paste it into Google Calendar → Settings → Add calendar → From URL."
              : "Could not open Apple Calendar — copy the webcal link below, or paste the HTTPS link in Settings → Calendar → Add Subscription."}
          </p>
          <div className="space-y-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              Webcal link
            </p>
            <p className="break-all font-mono text-xs">{feedFallback.webcalUrl}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => copyText(feedFallback.webcalUrl, "Webcal link")}
            >
              Copy webcal link
            </Button>
          </div>
          <div className="space-y-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              HTTPS feed
            </p>
            <p className="break-all font-mono text-xs">{feedFallback.httpsUrl}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => copyText(feedFallback.httpsUrl, "HTTPS link")}
            >
              Copy HTTPS link
            </Button>
          </div>
        </div>
      )}

      <p className="text-xs text-[var(--muted-foreground)]">
        Google and Apple check this link every few hours. When you enroll, book
        a court, or the schedule changes, it shows up automatically — no new
        download needed.
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
    </>
  );

  const triggerButton = trigger ?? (
    <button
      type="button"
      data-testid="add-to-calendar-trigger"
      onClick={openSheet}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--triaz-ink)]/25",
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
  );

  return (
    <>
      {triggerButton}
      {sheetVisible && rendersSheet && (
        <>
          <div
            className="fixed inset-0 z-50 bg-[var(--foreground)]/25 backdrop-blur-sm"
            data-testid="add-to-calendar-overlay"
            aria-hidden
            onClick={closeSheet}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Add to calendar"
            data-testid="add-to-calendar-sheet"
            className={cn(
              "glass-regular fixed z-50 overflow-y-auto outline-none",
              "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-[var(--radius-glass-inner)] border-b-0 p-6 pb-safe",
              "md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:max-h-[min(85dvh,640px)] md:w-full md:max-w-md",
              "md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[var(--radius-glass-inner)] md:border md:pb-6",
            )}
          >
            <div className="mb-4 flex flex-col gap-1">
              <h2 className="font-display text-xl font-medium tracking-tight">
                Add to calendar
              </h2>
              <p className="text-sm text-[var(--muted-foreground)]">
                {description}
              </p>
            </div>
            <div className="grid gap-5">{panelBody}</div>
          </div>
        </>
      )}
    </>
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
