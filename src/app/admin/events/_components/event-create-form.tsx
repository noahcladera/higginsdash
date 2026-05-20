"use client";

import { useMemo, useState } from "react";
import { DateField } from "@/components/ui/date-field";
import { ImageUpload } from "@/components/ui/image-upload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useTerms } from "@/components/tenant/terms-provider";
import { EventStaffField } from "../../classes/_components/event-staff-field";
import type { CoachOption } from "../../classes/_components/coach-assignment-field";
import { EventPricingField } from "../../classes/_components/event-pricing-field";
import { AgeAndLevelField } from "../../classes/_components/age-and-level-field";

type VenueOption = {
  id: string;
  name: string;
  kind: "club" | "school" | "rented_court";
};

export function EventCreateForm({
  action,
  submitLabel,
  venues,
  coaches,
}: {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  venues: VenueOption[];
  coaches: CoachOption[];
}) {
  const t = useTerms();
  const [audience, setAudience] = useState<"adult" | "youth">("adult");
  const [eventDate, setEventDate] = useState("");
  const clubVenues = useMemo(() => venues.filter((v) => v.kind === "club"), [venues]);

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="classType" value="event" />
      <input type="hidden" name="deliveryMode" value="at_club" />

      <Step
        n={1}
        title="Audience"
        hint="Choose who this event is for so level filters match the intended participants."
      >
        <Pills
          value={audience}
          onChange={(next) => setAudience(next)}
          options={[
            { value: "adult", label: "Adult" },
            { value: "youth", label: "Youth" },
          ]}
        />
      </Step>

      <Step
        n={2}
        title="Venue"
        hint={`Pick the ${t.club.singular.toLowerCase()} location where this event takes place.`}
      >
        <Field
          label={t.club.singular}
          help={`Participants will see this ${t.club.singular.toLowerCase()} on the event page and confirmation email.`}
        >
          <select name="venueId" className={selectClass} required defaultValue="">
            <option value="" disabled>
              Pick a venue...
            </option>
            {clubVenues.map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.name}
              </option>
            ))}
          </select>
        </Field>
      </Step>

      <Step
        n={3}
        title="Date and time"
        hint="Events are created as a single date. Create another event if you want to run it again next week."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Event date" help="The exact calendar day this event happens.">
            <DateField
              name="eventDate"
              value={eventDate}
              onChange={setEventDate}
              mode="any"
              locale="en-NL"
              required
            />
          </Field>
          <Field label="Start time" help="When check-in or warm-up begins.">
            <Input name="startTime" type="time" defaultValue="17:30" required />
          </Field>
          <Field label="End time" help="When the event should finish.">
            <Input name="endTime" type="time" defaultValue="20:30" required />
          </Field>
        </div>
      </Step>

      <Step
        n={4}
        title="Event details"
        hint="This is what people see when deciding whether to join."
      >
        <Field
          label="Event name"
          help="Short title shown in the event list, on the detail page, and in checkout."
        >
          <Input
            name="eventName"
            maxLength={160}
            placeholder="Friday doubles tournament"
            required
          />
        </Field>
        <Field
          label="Description"
          help="Explain format, who should join, what to bring, and any practical details."
        >
          <Textarea
            name="publicNotes"
            rows={4}
            placeholder="Friendly doubles tournament from 17:30 to 20:30. Rotating partners and short rounds."
            required
          />
        </Field>
      </Step>

      <Step
        n={5}
        title="Level (optional)"
        hint="Set age band or level brackets only when this event is meant for a specific group."
      >
        <AgeAndLevelField audience={audience === "adult" ? "adults" : "kids"} />
      </Step>

      <Step
        n={6}
        title="Staff"
        hint={`Pick the ${t.coach.plural.toLowerCase()} responsible for running this event.`}
      >
        <p className="text-xs text-[var(--muted-foreground)]">
          Select the lead staff member first, then add assistants if needed.
        </p>
        <EventStaffField coaches={coaches} />
      </Step>

      <Step
        n={7}
        title="Capacity and comms"
        hint="Control how many participants can join and any internal coordination notes."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Max participants" help="Total spots available for this event.">
            <Input
              name="maxStudents"
              type="number"
              min={1}
              max={200}
              defaultValue={20}
              required
            />
          </Field>
          <Field
            label="Min participants"
            help="Leave blank if there is no minimum before the event can run."
            optional
          >
            <Input name="minStudents" type="number" min={1} max={200} defaultValue="" />
          </Field>
        </div>
        <Field label="Internal notes" help="Visible to staff only, not to participants." optional>
          <Textarea name="internalNotes" rows={3} defaultValue="" />
        </Field>
        <ImageUpload
          name="coverImageUrl"
          kind="cover"
          aspect="16/9"
          label="Cover image (optional)"
          helpText="Shown at the top of the event page participants see before checkout."
        />
        <Field
          label="WhatsApp group invite link"
          help="Optional chat link shown after enrollment and included in confirmation email."
          optional
        >
          <Input
            name="whatsappUrl"
            type="url"
            placeholder="https://chat.whatsapp.com/..."
            defaultValue=""
          />
        </Field>
      </Step>

      <Step
        n={8}
        title="Pricing"
        hint="Set the standard event price. Add extra tiers when members or special groups pay differently."
      >
        <p className="text-xs text-[var(--muted-foreground)]">
          At least one valid price is required to publish this event.
        </p>
        <EventPricingField />
      </Step>

      <div className="flex justify-end">
        <Button tone="triaz" type="submit">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function Step({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-[var(--radius-md)] bg-[var(--surface)] p-5">
      <header className="flex items-center gap-2">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--triaz-soft)] text-[11px] font-semibold text-[var(--triaz-ink)]">
          {n}
        </span>
        <h3 className="text-sm font-medium">{title}</h3>
      </header>
      <p className="text-xs text-[var(--muted-foreground)]">{hint}</p>
      {children}
    </section>
  );
}

function Field({
  label,
  help,
  optional,
  children,
}: {
  label: string;
  help: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        {optional ? (
          <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            Optional
          </span>
        ) : null}
      </div>
      <p className="text-xs text-[var(--muted-foreground)]">{help}</p>
      {children}
    </div>
  );
}

function Pills<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface-strong)] p-0.5 text-sm">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-full px-4 py-1.5 transition-colors ${
            value === option.value
              ? "bg-[var(--triaz-soft)] font-medium text-[var(--triaz-ink)]"
              : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const selectClass =
  "flex h-9 w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50";
