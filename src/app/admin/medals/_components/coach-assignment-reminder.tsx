"use client";

import { Button } from "@/components/ui/button";
import { useActionFeedback } from "@/lib/feedback";
import { sendCoachAssignmentReminder } from "../actions";

export function CoachAssignmentReminder({
  coachPersonId,
  coachPhone,
  whatsappMedalsUrl,
  whatsappLevelsUrl,
  hasMedalGaps,
  hasLevelGaps,
}: {
  coachPersonId: string;
  coachPhone: string | null;
  whatsappMedalsUrl: string | null;
  whatsappLevelsUrl: string | null;
  hasMedalGaps: boolean;
  hasLevelGaps: boolean;
}) {
  const medalInbox = useActionFeedback({
    success: "Medal reminder sent to coach inbox",
  });
  const levelInbox = useActionFeedback({
    success: "Level reminder sent to coach inbox",
  });

  if (!hasMedalGaps && !hasLevelGaps) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-[var(--glass-border-subtle)] px-2 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
        Remind coach
      </span>

      {hasMedalGaps && (
        <>
          <Button
            variant="outline"
            tone="neutral"
            size="sm"
            disabled={medalInbox.pending}
            onClick={() => {
              medalInbox.run(() =>
                sendCoachAssignmentReminder({
                  coachPersonId,
                  kind: "medals",
                }),
              );
            }}
          >
            Inbox · medals
          </Button>
          {whatsappMedalsUrl ? (
            <Button asChild variant="outline" tone="neutral" size="sm">
              <a
                href={whatsappMedalsUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                WhatsApp · medals
              </a>
            </Button>
          ) : (
            <Button
              variant="outline"
              tone="neutral"
              size="sm"
              disabled
              title="Coach has no phone number on file"
            >
              WhatsApp · medals
            </Button>
          )}
        </>
      )}

      {hasLevelGaps && (
        <>
          <Button
            variant="outline"
            tone="neutral"
            size="sm"
            disabled={levelInbox.pending}
            onClick={() => {
              levelInbox.run(() =>
                sendCoachAssignmentReminder({
                  coachPersonId,
                  kind: "levels",
                }),
              );
            }}
          >
            Inbox · levels
          </Button>
          {whatsappLevelsUrl ? (
            <Button asChild variant="outline" tone="neutral" size="sm">
              <a
                href={whatsappLevelsUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                WhatsApp · levels
              </a>
            </Button>
          ) : (
            <Button
              variant="outline"
              tone="neutral"
              size="sm"
              disabled
              title={
                coachPhone
                  ? "Could not build WhatsApp link"
                  : "Coach has no phone number on file"
              }
            >
              WhatsApp · levels
            </Button>
          )}
        </>
      )}
    </div>
  );
}
