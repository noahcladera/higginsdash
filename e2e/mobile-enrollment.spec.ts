import { expect, test } from "@playwright/test";

import { requireMemberLogin } from "./helpers/auth";
import { warmRoute } from "./helpers/goto-and-wait";

test.describe("mobile programs / enrollment", () => {
  test("programs catalog loads with program links", async ({ page }) => {
    await requireMemberLogin(page);
    await warmRoute(page, "/portal/programs");

    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible({ timeout: 15_000 });

    const programLink = page
      .locator('a[href*="/portal/programs/"]')
      .filter({ hasNot: page.locator('[href="/portal/programs"]') })
      .first();

    if (!(await programLink.isVisible().catch(() => false))) {
      test.skip(true, "No programs in catalog — run db:seed-real-catalog");
    }

    const href = await programLink.getAttribute("href");
    expect(href).toMatch(/\/portal\/programs\/.+/);
    await programLink.click();
    await expect(page).toHaveURL(/\/portal\/programs\/.+/);
  });

  test("series detail (enroll page) renders after tapping a series", async ({
    page,
  }) => {
    await requireMemberLogin(page);
    await warmRoute(page, "/portal/programs");

    // A series card links into /portal/programs/<slug>/<seriesId> — the
    // heaviest page in the app. With its own loading.tsx the navigation now
    // acknowledges instantly and the enroll content lands.
    const seriesLink = page
      .locator('a[href*="/portal/programs/"]')
      .filter({ hasNot: page.locator('[href="/portal/programs"]') })
      .filter({ hasText: /enroll|join waitlist/i })
      .first();

    if (!(await seriesLink.isVisible().catch(() => false))) {
      test.skip(true, "No enrollable series — run db:seed-real-catalog");
    }

    await seriesLink.click();
    await expect(page).toHaveURL(/\/portal\/programs\/[^/]+\/[^/]+/, {
      timeout: 15_000,
    });
    // The enroll affordance (or a trial fallback) confirms the detail page
    // streamed in rather than hanging on a dead tap.
    await expect(
      page
        .getByRole("button", { name: /enroll|join waitlist/i })
        .or(page.getByRole("link", { name: /request a trial/i }))
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
