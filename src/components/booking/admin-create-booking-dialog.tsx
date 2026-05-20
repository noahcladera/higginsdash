"use client";

/**
 * Admin front-desk booking: always on behalf of a coach (private lesson)
 * or a member (court play). Never attributes the slot to the logged-in admin.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { createBooking } from "@/lib/booking/actions";
import type { CalendarSlot } from "@/lib/booking/queries";
import { startCheckout as beginCheckout } from "@/lib/payments/start-checkout";
import { useActionFeedback } from "@/lib/feedback";
import { PartyInput, type PartyEntry } from "./party-input";
import {
  searchClubMembers,
  searchMembersForAdminBooking,
} from "@/lib/booking/partner-lookup";
import { useTerms } from "@/components/tenant/terms-provider";
import type { BookingPartnerCaptureMode } from "@prisma/client";

export type CoachOption = { personId: string; name: string };

type BookingMode = "coach" | "member";

type MemberCandidate = {
  personId: string;
  name: string;
  hint: string | null;
};

export function AdminCreateBookingDialog({
  open,
  onOpenChange,
  courtId,
  courtName,
  slot,
  clubName,
  clubSlug,
  coachOptions,
  partnerCaptureMode,
  requiresPayment,
  pricePerHourEur,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courtId: string;
  courtName: string;
  slot: CalendarSlot;
  clubId: string;
  clubName: string;
  clubSlug: "triaz" | "randwijck";
  coachOptions: CoachOption[];
  partnerCaptureMode: BookingPartnerCaptureMode;
  requiresPayment: boolean;
  pricePerHourEur: number | null;
}) {
  const router = useRouter();
  const t = useTerms();
  const [mode, setMode] = useState<BookingMode>("coach");
  const [coachPersonId, setCoachPersonId] = useState("");
  const [member, setMember] = useState<MemberCandidate | null>(null);
  const [memberQuery, setMemberQuery] = useState("");
  const [memberResults, setMemberResults] = useState<MemberCandidate[]>([]);
  const [memberSearchLoading, setMemberSearchLoading] = useState(false);
  const [partyEntries, setPartyEntries] = useState<PartyEntry[]>([]);
  const [notes, setNotes] = useState("");
  const [durationMinutes, setDurationMinutes] = useState<30 | 45 | 60>(60);
  const [checkoutPending, startCheckout] = useTransition();
  const { run, pending: createPending, error } = useActionFeedback({
    success: "Court booked",
    successDescription: `${courtName} · ${clubName}`,
    onSuccess: () => onOpenChange(false),
  });
  const isPending = checkoutPending || createPending;

  const effectiveDuration = mode === "coach" ? durationMinutes : 60;
  const willChargeMember =
    mode === "member" &&
    requiresPayment &&
    pricePerHourEur != null;
  const priceDueEur = willChargeMember
    ? Math.round(((pricePerHourEur as number) * effectiveDuration) / 60 * 100) /
      100
    : 0;

  const sortedCoaches = useMemo(
    () => [...coachOptions].sort((a, b) => a.name.localeCompare(b.name)),
    [coachOptions],
  );

  useEffect(() => {
    if (mode !== "member") return;
    if (memberQuery.trim().length < 2) {
      setMemberResults([]);
      return;
    }
    let alive = true;
    const timer = setTimeout(async () => {
      setMemberSearchLoading(true);
      const res = await searchMembersForAdminBooking({
        clubSlug,
        query: memberQuery,
        limit: 12,
      });
      if (!alive) return;
      setMemberSearchLoading(false);
      if (res.ok) {
        setMemberResults(
          res.candidates.map((c) => ({
            personId: c.personId,
            name: c.name,
            hint: c.hint,
          })),
        );
      } else {
        setMemberResults([]);
      }
    }, 200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [memberQuery, clubSlug, mode]);

  const resetMode = (next: BookingMode) => {
    setMode(next);
    setPartyEntries([]);
    setNotes("");
    if (next === "coach") {
      setMember(null);
      setMemberQuery("");
      setMemberResults([]);
    } else {
      setCoachPersonId("");
      setDurationMinutes(60);
    }
  };

  const canSubmit =
    mode === "coach"
      ? !!coachPersonId
      : !!member?.personId;

  const handleSubmit = () => {
    if (!canSubmit) return;

    const bookedForPersonId =
      mode === "coach" ? coachPersonId : member!.personId;
    const purpose: "coaching" | "personal" =
      mode === "coach" ? "coaching" : "personal";
    const partnerList = partyEntries.map((entry) => ({
      partnerName: entry.partnerName,
      personId: entry.personId,
    }));

    const bookingInput = {
      courtId,
      startsAtUtc: slot.startsAtUtc.toISOString(),
      needsLights: false,
      purpose,
      bookedForPersonId,
      durationMinutes: mode === "coach" ? durationMinutes : undefined,
      notes: notes.trim() || undefined,
      partners: partnerList,
    };

    if (willChargeMember && priceDueEur > 0) {
      onOpenChange(false);
      startCheckout(() => {
        void beginCheckout(
          {
            amountEur: priceDueEur,
            description: `${courtName} · ${clubName} · ${member!.name} · ${slot.startsAtLocal.replace("T", " ")}`,
            returnUrl: "/admin/bookings",
            action: {
              kind: "court_booking_create",
              payload: bookingInput,
            },
          },
          router,
        );
      });
      return;
    }

    run(() => createBooking(bookingInput));
  };

  const slotLabel = slot.startsAtLocal.replace("T", " ");
  const durationLabel =
    effectiveDuration === 60 ? "1 hour" : `${effectiveDuration} min`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Book for someone · {courtName}</DialogTitle>
          <DialogDescription>
            {clubName} · {slotLabel} · {durationLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Who is this for?</Label>
            <p className="text-xs text-[var(--muted-foreground)]">
              Pick a {t.coach.singular.toLowerCase()} for a{" "}
              {t.privateLesson.singular.toLowerCase()}, or a member for personal
              court play.
            </p>
            <div
              role="group"
              aria-label="Booking type"
              className="inline-flex w-full overflow-hidden rounded-md border border-[var(--border)]"
            >
              <button
                type="button"
                onClick={() => resetMode("coach")}
                className={cn(
                  "flex-1 px-3 py-2 text-sm transition-colors",
                  mode === "coach"
                    ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                    : "bg-transparent hover:bg-[var(--muted)]/60",
                )}
              >
                {t.coach.singular} · {t.privateLesson.singular.toLowerCase()}
              </button>
              <button
                type="button"
                onClick={() => resetMode("member")}
                className={cn(
                  "flex-1 border-l border-[var(--border)] px-3 py-2 text-sm transition-colors",
                  mode === "member"
                    ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                    : "bg-transparent hover:bg-[var(--muted)]/60",
                )}
              >
                Member · court play
              </button>
            </div>
          </div>

          {mode === "coach" ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="admin-book-coach">{t.coach.singular}</Label>
                <p className="text-xs text-[var(--muted-foreground)]">
                  The lesson appears on the calendar under this{" "}
                  {t.coach.singular.toLowerCase()}&apos;s name.
                </p>
                <Select
                  value={coachPersonId}
                  onValueChange={setCoachPersonId}
                >
                  <SelectTrigger id="admin-book-coach">
                    <SelectValue placeholder={`Select ${t.coach.singular.toLowerCase()}…`} />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedCoaches.map((c) => (
                      <SelectItem key={c.personId} value={c.personId}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Duration</Label>
                <p className="text-xs text-[var(--muted-foreground)]">
                  How long the {t.privateLesson.singular.toLowerCase()} runs.
                  Grid cells stay 60 min; the booking uses the length you pick.
                </p>
                <div className="inline-flex overflow-hidden rounded-md border border-[var(--border)]">
                  {([30, 45, 60] as const).map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setDurationMinutes(mins)}
                      className={cn(
                        "px-3 py-1.5 text-sm transition-colors",
                        "border-l border-[var(--border)] first:border-l-0",
                        durationMinutes === mins
                          ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                          : "bg-transparent hover:bg-[var(--muted)]/60",
                      )}
                      aria-pressed={durationMinutes === mins}
                    >
                      {mins} min
                    </button>
                  ))}
                </div>
              </div>

              <PartyInput
                value={partyEntries}
                onChange={setPartyEntries}
                label={t.student.singular}
                max={2}
                helperText={`Up to two ${t.student.plural.toLowerCase()} on this ${t.privateLesson.singular.toLowerCase()}. Names are enough if they are not members yet.`}
              />
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="admin-book-member">Member</Label>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Search by name. The same membership and booking rules apply as
                  when they book in the member portal.
                </p>
                {member ? (
                  <div className="flex items-center justify-between gap-2 rounded-md border border-[var(--border)] px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{member.name}</p>
                      {member.hint && (
                        <p className="text-xs text-[var(--muted-foreground)]">
                          {member.hint}
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setMember(null);
                        setMemberQuery("");
                      }}
                    >
                      Change
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Input
                      id="admin-book-member"
                      placeholder="Type at least two letters…"
                      value={memberQuery}
                      onChange={(e) => setMemberQuery(e.target.value)}
                      autoComplete="off"
                    />
                    {memberQuery.trim().length >= 2 && (
                      <div className="max-h-40 overflow-y-auto rounded-md border border-[var(--border)]">
                        {memberSearchLoading ? (
                          <p className="p-3 text-sm text-[var(--muted-foreground)]">
                            Searching…
                          </p>
                        ) : memberResults.length === 0 ? (
                          <p className="p-3 text-sm text-[var(--muted-foreground)]">
                            No members with active coverage at this club.
                          </p>
                        ) : (
                          <ul className="divide-y divide-[var(--border)]">
                            {memberResults.map((r) => (
                              <li key={r.personId}>
                                <button
                                  type="button"
                                  className="block w-full px-3 py-2 text-left hover:bg-[var(--muted)]"
                                  onClick={() => {
                                    setMember(r);
                                    setMemberQuery("");
                                    setMemberResults([]);
                                  }}
                                >
                                  <span className="text-sm font-medium">
                                    {r.name}
                                  </span>
                                  {r.hint && (
                                    <span className="mt-0.5 block text-xs text-[var(--muted-foreground)]">
                                      {r.hint}
                                    </span>
                                  )}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <PartyInput
                value={partyEntries}
                onChange={setPartyEntries}
                label="Partner"
                max={3}
                lookup={
                  partnerCaptureMode === "fk_member"
                    ? async (q) => {
                        const res = await searchClubMembers({
                          clubSlug,
                          query: q,
                        });
                        return res.ok ? res.candidates : [];
                      }
                    : undefined
                }
                membersOnly={partnerCaptureMode === "fk_member"}
              />
            </>
          )}

          <div className="space-y-1">
            <Label htmlFor="admin-book-notes">Notes (optional)</Label>
            <p className="text-xs text-[var(--muted-foreground)]">
              Internal note for the office — not shown on the public calendar.
            </p>
            <Textarea
              id="admin-book-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !canSubmit}>
            {isPending
              ? "Booking…"
              : willChargeMember && priceDueEur > 0
                ? `Continue to payment · €${priceDueEur.toFixed(2)}`
                : "Confirm booking"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
