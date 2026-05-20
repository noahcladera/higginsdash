"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  createCalendarFeedToken,
  revokeCalendarFeedToken,
} from "@/lib/portal/calendar-feed-actions";
import type { CalendarFeedScope } from "@prisma/client";

export interface CalendarFeedRow {
  id: string;
  scope: CalendarFeedScope;
  label: string | null;
  /** Token value — server may return masked unless this is the just-created one. */
  token: string;
  createdAt: Date;
  revokedAt: Date | null;
  lastFetchedAt: Date | null;
}

/**
 * Self-serve "Calendar sync" panel. Renders the user's existing tokens
 * and lets them mint a new one. Once minted we surface both an
 * `https://` and `webcal://` flavour because Apple Calendar opens
 * `webcal` directly, while Google Calendar wants the plain HTTPS URL.
 *
 * Tokens are private — do not log them, do not paste into Sentry.
 */
export function CalendarSyncCard({
  origin,
  initialTokens,
  hasHousehold,
}: {
  /** Absolute base URL like "https://higgins.example". */
  origin: string;
  initialTokens: CalendarFeedRow[];
  /** Disable household-scope option for solo adults. */
  hasHousehold: boolean;
}) {
  const [tokens, setTokens] = useState<CalendarFeedRow[]>(initialTokens);
  const [scope, setScope] = useState<CalendarFeedScope>(
    hasHousehold ? "household" : "self",
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<string | null>(null);

  const activeTokens = tokens.filter((t) => !t.revokedAt);

  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
      <div className="space-y-1">
        <h2 className="font-display text-lg font-medium tracking-tight">
          Calendar sync
        </h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          Subscribe Google Calendar or Apple Calendar to your classes.
          The link is your private URL — anyone who has it can see your
          schedule, so don&apos;t share it.
        </p>
      </div>

      <div className="mt-4 space-y-3">
        {activeTokens.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            No calendar link yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {activeTokens.map((t) => {
              const httpsUrl = `${origin}/api/calendar/${t.token}`;
              const webcalUrl = httpsUrl.replace(/^https?:/, "webcal:");
              return (
                <li
                  key={t.id}
                  className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--card)] p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="neutral" className="capitalize">
                        {t.scope === "household"
                          ? "Whole household"
                          : "Just me"}
                      </Badge>
                      {t.label && (
                        <span className="text-[var(--foreground)]">
                          {t.label}
                        </span>
                      )}
                      {t.lastFetchedAt && (
                        <span className="text-xs text-[var(--muted-foreground)]">
                          Last sync{" "}
                          {new Intl.DateTimeFormat("en-NL", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          }).format(new Date(t.lastFetchedAt))}
                        </span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      tone="danger"
                      disabled={pending}
                      onClick={() => {
                        setError(null);
                        startTransition(async () => {
                          const res = await revokeCalendarFeedToken({
                            id: t.id,
                          });
                          if (!res.ok) {
                            setError(res.error);
                          } else {
                            setTokens((prev) =>
                              prev.map((row) =>
                                row.id === t.id
                                  ? { ...row, revokedAt: new Date() }
                                  : row,
                              ),
                            );
                          }
                        });
                      }}
                    >
                      Revoke
                    </Button>
                  </div>
                  <div className="mt-2 grid gap-1 text-xs">
                    <UrlRow
                      label="Google Calendar (HTTPS)"
                      url={httpsUrl}
                      reveal={justCreated === t.id}
                    />
                    <UrlRow
                      label="Apple Calendar (webcal)"
                      url={webcalUrl}
                      reveal={justCreated === t.id}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <label className="text-xs text-[var(--muted-foreground)]">
            Include:
          </label>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as CalendarFeedScope)}
            className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-sm"
          >
            <option value="self">Just my classes</option>
            {hasHousehold && (
              <option value="household">My whole household</option>
            )}
          </select>

          <Button
            size="sm"
            tone="triaz"
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const res = await createCalendarFeedToken({ scope });
                if (!res.ok) {
                  setError(res.error);
                } else {
                  setTokens((prev) => [
                    {
                      id: res.id,
                      scope,
                      label: null,
                      token: res.token,
                      createdAt: new Date(),
                      revokedAt: null,
                      lastFetchedAt: null,
                    },
                    ...prev,
                  ]);
                  setJustCreated(res.id);
                }
              });
            }}
          >
            Generate calendar link
          </Button>
        </div>

        {error && (
          <p className="text-xs text-[var(--destructive)]">{error}</p>
        )}

        <details className="text-xs text-[var(--muted-foreground)]">
          <summary className="cursor-pointer">How do I subscribe?</summary>
          <div className="mt-2 space-y-2">
            <p>
              <strong>Google Calendar:</strong> Open Google Calendar →
              the “+” next to “Other calendars” → “From URL” → paste the
              HTTPS link above. Google polls every few hours.
            </p>
            <p>
              <strong>Apple Calendar (Mac/iPhone):</strong> Click the
              webcal link, or in Calendar → File → New Calendar
              Subscription, paste the link, and pick refresh.
            </p>
          </div>
        </details>
      </div>
    </section>
  );
}

function UrlRow({
  label,
  url,
  reveal,
}: {
  label: string;
  url: string;
  reveal: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const masked = url.replace(/[a-f0-9]{32,}/, "••••••••••••");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-medium text-[var(--foreground)]">{label}</span>
      <code className="select-all break-all rounded bg-[var(--muted)]/40 px-1.5 py-0.5 text-[11px]">
        {reveal ? url : masked}
      </code>
      <button
        type="button"
        className="text-[var(--triaz-ink)] underline-offset-2 hover:underline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            // Clipboard API unavailable in this browser; the user can
            // still long-press / triple-click the masked code above.
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
