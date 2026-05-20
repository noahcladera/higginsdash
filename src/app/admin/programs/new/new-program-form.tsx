"use client";

import { useActionState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createProgramForm,
  initialCreateProgramFormState,
  type CreateProgramFormState,
} from "../actions";

const CLASS_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "group_lesson", label: "Group lesson" },
  { value: "high_performance", label: "High performance" },
  { value: "school_pickup", label: "School pickup" },
  { value: "school_onsite", label: "School on-site" },
  { value: "private_individual", label: "Private (individual)" },
  { value: "private_small_group", label: "Private (small group)" },
  { value: "camp", label: "Camp" },
  { value: "trial", label: "Trial" },
  { value: "event", label: "Event" },
];

export function NewProgramForm({
  programSingular,
}: {
  programSingular: string;
}) {
  const [state, formAction] = useActionState(createProgramForm, initialCreateProgramFormState);

  return (
    <form action={formAction} className="max-w-lg space-y-6">
      {state.ok === false && (
        <div className="rounded-md border border-[var(--destructive)] bg-[var(--card)] p-3 text-sm text-[var(--destructive)]">
          {state.error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          required
          maxLength={200}
          placeholder={`e.g. Kids group lessons`}
          autoComplete="off"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="slug">URL slug (optional)</Label>
        <p className="text-xs text-[var(--muted-foreground)]">
          Lowercase letters, numbers, and hyphens. Leave blank to derive from
          the name (e.g. &quot;Kids group&quot; → <code>kids-group</code>).
        </p>
        <Input
          id="slug"
          name="slug"
          maxLength={120}
          placeholder="e.g. kids-group-lessons"
          autoComplete="off"
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Audience</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="targetAudience"
            value="kids"
            defaultChecked
            className="rounded border-[var(--border)]"
          />
          Kids
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="targetAudience"
            value="adults"
            className="rounded border-[var(--border)]"
          />
          Adults
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="targetAudience"
            value="mixed"
            className="rounded border-[var(--border)]"
          />
          Mixed
        </label>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="defaultClassType">Default class type</Label>
        <p className="text-xs text-[var(--muted-foreground)]">
          Used when creating class series under this {programSingular.toLowerCase()}. You can still pick another type per series.
        </p>
        <select
          id="defaultClassType"
          name="defaultClassType"
          required
          className="flex h-10 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
          defaultValue="group_lesson"
        >
          {CLASS_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit">Create {programSingular}</Button>
        <Link
          href="/admin/programs"
          className="text-sm text-[var(--muted-foreground)] underline-offset-4 hover:underline"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
