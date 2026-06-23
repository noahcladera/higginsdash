"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { v5 as uuidv5 } from "uuid";
import { prisma } from "@/lib/prisma";
import { SYSTEM_PERSON_IDS } from "@/lib/system-ids";
import { shouldGrantFirstUserAdmin } from "@/lib/auth/ensure-person";
import { checkRateLimitByIp } from "@/lib/rate-limit";

/** Same RFC 4122 NS_DNS namespace the seed script uses for deterministic ids. */
const CHILD_ID_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

const GenderEnum = z.enum(["male", "female", "other", "prefer_not_to_say"]);

const ChildSchema = z.object({
  firstName: z.string().trim().min(1, "Each child needs a first name").max(100),
  lastName: z.string().trim().max(100).default(""),
  dateOfBirth: z
    .string()
    .trim()
    .min(1, "Each child needs a date of birth"),
  /// Optional school for school-pickup program recommendations. Stored
  /// on `students.school` once the child gets a Student row. Free text
  /// because the curated list lives in `lib/schools.ts`.
  school: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v ? v : null)),
});

const SignUpSchema = z
  .object({
    path: z.enum(["myself", "children"]),
    parentAlsoPlays: z.boolean().default(false),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("That email looks off"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(72),
    firstName: z.string().trim().min(1, "First name is required").max(100),
    lastName: z.string().trim().min(1, "Last name is required").max(100),
    phone: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v : null)),
    dateOfBirth: z.string().trim().min(1, "Date of birth is required"),
    gender: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v : null))
      .refine(
        (v) => v === null || GenderEnum.safeParse(v).success,
        "Invalid gender",
      ),
    addressLine1: z.string().trim().min(1, "Street is required").max(200),
    addressLine2: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v : null)),
    postalCode: z.string().trim().min(1, "Postal code is required").max(20),
    city: z.string().trim().min(1, "City is required").max(100),
    country: z.string().trim().min(1).max(2).default("NL"),
    children: z.array(ChildSchema).default([]),
  })
  .superRefine((val, ctx) => {
    if (val.path === "children" && val.children.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["children"],
        message: "Add at least one child to continue",
      });
    }
  });

export type SignUpInput = z.input<typeof SignUpSchema>;
export type SignUpResult = { ok: true } | { ok: false; error: string };

/**
 * Open self-signup. Creates a Supabase auth user with email pre-confirmed
 * (no verification email sent), spins up a `people` row + `household` +
 * any children as additional household members, then signs the user in
 * so they land on `/portal` already authenticated.
 *
 * Children are NOT created as `Student` rows — that happens later when
 * they sign up for a lesson.
 */
export async function signUp(input: SignUpInput): Promise<SignUpResult> {
  // Throttle public signups per IP to prevent mass account/CRM creation.
  const rl = await checkRateLimitByIp("signup", { limit: 5, windowSec: 3600 });
  if (!rl.success) {
    return {
      ok: false,
      error: "Too many sign-up attempts. Please wait a while and try again.",
    };
  }

  const parsed = SignUpSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  const data = parsed.data;

  const dob = parseDate(data.dateOfBirth);
  if (!dob) {
    return { ok: false, error: "Date of birth is not a valid date." };
  }

  // Validate every child DOB up front so we don't half-create the account.
  const childDobs: Date[] = [];
  for (const child of data.children) {
    const cd = parseDate(child.dateOfBirth);
    if (!cd) {
      return {
        ok: false,
        error: `Date of birth for ${child.firstName || "a child"} is not valid.`,
      };
    }
    childDobs.push(cd);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return {
      ok: false,
      error: "Server is missing Supabase credentials. Contact the office.",
    };
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Create the auth user. Email is NOT pre-confirmed — Supabase sends a
  //    verification email and the user cannot sign in until they confirm.
  //    (Requires email confirmations enabled + SMTP configured in Supabase.)
  const { data: created, error: createErr } =
    await admin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: false,
    });
  if (createErr || !created.user) {
    // Surface friendly message for "already registered" without leaking details.
    const msg = createErr?.message ?? "Could not create account.";
    return {
      ok: false,
      error: /already.*(registered|exists)/i.test(msg)
        ? "An account with that email already exists. Try signing in instead."
        : msg,
    };
  }
  const authUserId = created.user.id;

  // 2. Insert CRM rows in a single transaction so we never end up with
  //    a half-built household if anything blows up.
  try {
    await prisma.$transaction(async (tx) => {
      // First-real-user-becomes-admin, but ONLY when allowed by the
      // PLATFORM_ADMIN_EMAILS allowlist (shared with ensurePersonForAuthUser).
      // Serializable isolation prevents two concurrent first signups from both
      // observing an empty table and both being promoted.
      const realPeopleCount = await tx.person.count({
        where: { id: { notIn: [...SYSTEM_PERSON_IDS] } },
      });
      const isFirstUser = realPeopleCount === 0;
      const grantAdmin = shouldGrantFirstUserAdmin({
        isFirstUser,
        email: data.email,
      });

      await tx.person.create({
        data: {
          id: authUserId,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          dateOfBirth: dob,
          gender: data.gender as
            | "male"
            | "female"
            | "other"
            | "prefer_not_to_say"
            | null,
          addressLine1: data.addressLine1,
          addressLine2: data.addressLine2,
          postalCode: data.postalCode,
          city: data.city,
          country: data.country,
          isAdmin: grantAdmin,
          lastLoginAt: new Date(),
        },
      });

      await tx.emailAddress.create({
        data: {
          personId: authUserId,
          address: data.email,
          kind: "personal",
          isPrimary: true,
          isVerified: true,
          verifiedAt: new Date(),
        },
      });

      const householdName =
        `${data.lastName || data.firstName || "New"} household`.trim();

      const household = await tx.household.create({
        data: {
          displayName: householdName,
          primaryContactPersonId: authUserId,
          addressLine1: data.addressLine1,
          addressLine2: data.addressLine2,
          postalCode: data.postalCode,
          city: data.city,
          country: data.country,
          // Adult-only signups always play; parents only when they tick the box.
          parentAlsoPlays:
            data.path === "myself" ? true : data.parentAlsoPlays,
        },
      });

      await tx.householdMember.create({
        data: {
          householdId: household.id,
          personId: authUserId,
          roleInHousehold: "adult",
        },
      });

      for (let i = 0; i < data.children.length; i++) {
        const child = data.children[i];
        const childId = uuidv5(
          `child:${authUserId}:${i}`,
          CHILD_ID_NAMESPACE,
        );
        await tx.person.create({
          data: {
            id: childId,
            firstName: child.firstName,
            lastName: child.lastName || data.lastName,
            dateOfBirth: childDobs[i],
            country: data.country,
          },
        });
        await tx.householdMember.create({
          data: {
            householdId: household.id,
            personId: childId,
            roleInHousehold: "child",
          },
        });
        // Provision the Student row up-front when the parent told us a
        // school — this is what keeps the school-pickup recommendations
        // on the home page accurate from the very first login. Children
        // without a school stay non-students until a coach enrolls them.
        if (child.school) {
          await tx.student.create({
            data: {
              personId: childId,
              school: child.school,
            },
          });
        }
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (err) {
    // Roll back the auth user so the customer can re-try with the same email.
    await admin.auth.admin.deleteUser(authUserId).catch(() => {
      /* best-effort cleanup */
    });
    const msg = err instanceof Error ? err.message : "Could not save account.";
    return { ok: false, error: msg };
  }

  // 3. Do NOT auto-sign-in. The account must verify its email first; Supabase
  //    rejects sign-in until confirmed. Send them to login with a friendly
  //    "check your inbox" nudge.
  redirect("/login?verify_email=1");
}

function parseDate(value: string): Date | null {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}
