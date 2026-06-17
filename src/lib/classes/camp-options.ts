import { z } from "zod";

export type CampAttendanceKind =
  | "full_week_half_day"
  | "full_week_full_day"
  | "daily_drop_in_half_day"
  | "daily_drop_in_full_day";

export type CampOption = {
  id: string;
  label: string;
  attendanceKind: CampAttendanceKind;
  amountEur: number;
  forMembers?: boolean;
};

export type CampOptionsConfig = {
  options: CampOption[];
  dropInEnabled: boolean;
  dropInDates: string[];
};

const CampAttendanceKindSchema = z.enum([
  "full_week_half_day",
  "full_week_full_day",
  "daily_drop_in_half_day",
  "daily_drop_in_full_day",
]);

const CampOptionSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  attendanceKind: CampAttendanceKindSchema,
  amountEur: z.number().min(0).max(10000),
  forMembers: z.boolean().optional(),
});

const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const CampOptionsConfigSchema = z
  .object({
    options: z.array(CampOptionSchema),
    dropInEnabled: z.boolean().default(false),
    dropInDates: z.array(IsoDateSchema).default([]),
  })
  .superRefine((cfg, ctx) => {
    const ids = cfg.options.map((o) => o.id.toLowerCase());
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Camp option ids must be unique",
      });
    }

    const labels = cfg.options.map((o) => o.label.toLowerCase());
    if (new Set(labels).size !== labels.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Camp option labels must be unique",
      });
    }

    const memberPerKind = new Map<CampAttendanceKind, number>();
    for (const row of cfg.options) {
      if (!row.forMembers) continue;
      const next = (memberPerKind.get(row.attendanceKind) ?? 0) + 1;
      memberPerKind.set(row.attendanceKind, next);
    }
    for (const [kind, count] of memberPerKind.entries()) {
      if (count > 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Only one member price is allowed for ${kind}`,
        });
      }
    }

    const hasDropInOption = cfg.options.some((o) =>
      o.attendanceKind.startsWith("daily_drop_in_"),
    );
    if (!cfg.dropInEnabled && hasDropInOption) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Drop-in options require drop-in mode to be enabled",
      });
    }
    // dropInDates may be empty at parse time — create/update syncs them
    // from the camp week schedule (Mon–Fri minus exclusions).
    if (cfg.options.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one camp option is required",
      });
    }
  });

export const CampOptionsJsonSchema = z
  .string()
  .optional()
  .transform((raw, ctx) => {
    if (!raw || raw.trim() === "") return null as CampOptionsConfig | null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid camp options JSON",
      });
      return z.NEVER;
    }
    const cfg = CampOptionsConfigSchema.safeParse(parsed);
    if (!cfg.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid camp options shape",
      });
      return z.NEVER;
    }
    return cfg.data;
  });

export type CampSelection = {
  optionId: string;
  dropInDateIso?: string;
};

export function parseCampOptions(raw: unknown): CampOptionsConfig | null {
  if (raw == null) return null;
  const parsed = CampOptionsConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function parseCampSelection(raw: unknown): CampSelection | null {
  const schema = z.object({
    optionId: z.string().min(1),
    dropInDateIso: IsoDateSchema.optional(),
  });
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Align drop-in bookable dates with generated camp session days. */
export function syncCampDropInDates(
  campOptions: CampOptionsConfig,
  sessionDateKeys: string[],
): CampOptionsConfig {
  if (!campOptions.dropInEnabled) return campOptions;
  return {
    ...campOptions,
    dropInDates: [...sessionDateKeys].sort(),
  };
}

export function resolveCampCheckoutPrice(args: {
  campOptions: CampOptionsConfig | null;
  selection: CampSelection | null;
  hasActiveMembership: boolean;
}): number | null {
  if (!args.campOptions || !args.selection) return null;
  const selected = args.campOptions.options.find(
    (o) => o.id === args.selection?.optionId,
  );
  if (!selected) return null;
  const group = args.campOptions.options.filter(
    (o) => o.attendanceKind === selected.attendanceKind,
  );
  if (args.hasActiveMembership) {
    const member = group.find((o) => o.forMembers);
    if (member) return member.amountEur;
  }
  return (
    group.find((o) => !o.forMembers)?.amountEur ??
    group[0]?.amountEur ??
    selected.amountEur
  );
}
