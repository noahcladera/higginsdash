import { expect, type Page } from "@playwright/test";

export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "higgins-test";

/** Seeded personas — password `higgins-test` for all. */
export const PERSONAS = {
  /** Default E2E member: Beatrice, family joint membership (examples seed). */
  parentSingle:
    process.env.E2E_EMAIL ?? "parent.single.example@higginstennisnl.test",
  parentMulti: "parent.multi.example@higginstennisnl.test",
  adultStudent: "adult.example@higginstennisnl.test",
  coach: "coach.example@higginstennisnl.test",
  /** Demo personas (db:seed-demo-personas) — preferred for enrollment flows. */
  parentDemo: "parent.demo@higginstennisnl.test",
  studentDemo: "student.demo@higginstennisnl.test",
} as const;

export const E2E_EMAIL = PERSONAS.parentSingle;

async function loginWithEmail(
  page: Page,
  email: string,
  expectUrl: RegExp,
): Promise<boolean> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  try {
    await page.waitForURL(expectUrl, { timeout: 15_000 });
    return true;
  } catch {
    const err = page.getByRole("status");
    if (await err.isVisible()) {
      console.warn(
        `E2E login failed for ${email} (${await err.textContent()}). Run npm run db:seed-examples or db:seed-demo-personas.`,
      );
    }
    return false;
  }
}

/** Returns false when seed user is unavailable — tests should skip. */
export async function loginAsMember(
  page: Page,
  email: string = PERSONAS.parentSingle,
): Promise<boolean> {
  return loginWithEmail(page, email, /\/portal/);
}

export async function requireMemberLogin(
  page: Page,
  email: string = PERSONAS.parentSingle,
) {
  const ok = await loginAsMember(page, email);
  expect(
    ok,
    `Could not log in as ${email} — run npm run db:seed-examples`,
  ).toBe(true);
}

export async function loginAsCoach(page: Page): Promise<boolean> {
  return loginWithEmail(page, PERSONAS.coach, /\/coach/);
}

export async function requireCoachLogin(page: Page) {
  const ok = await loginAsCoach(page);
  expect(
    ok,
    `Could not log in as ${PERSONAS.coach} — run npm run db:seed-examples`,
  ).toBe(true);
}

export async function loginAsAdultStudent(page: Page): Promise<boolean> {
  return loginAsMember(page, PERSONAS.adultStudent);
}

export async function loginAsParentMulti(page: Page): Promise<boolean> {
  return loginAsMember(page, PERSONAS.parentMulti);
}

export async function loginAsParentDemo(page: Page): Promise<boolean> {
  return loginAsMember(page, PERSONAS.parentDemo);
}
