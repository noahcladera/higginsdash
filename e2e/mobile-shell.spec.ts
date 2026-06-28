import { expect, test } from "@playwright/test";

import { requireMemberLogin } from "./helpers/auth";
import { closeMoreSheet, openMoreSheet, tapTab } from "./helpers/navigation";
import { warmRoute } from "./helpers/goto-and-wait";

test.describe("mobile member shell", () => {
  test.beforeEach(async ({ page }) => {
    await requireMemberLogin(page);
    await warmRoute(page, "/portal");
  });

  test("tab bar navigates to core routes", async ({ page }) => {
    await tapTab(page, "Enrolment");
    await expect(page).toHaveURL(/\/portal\/programs/);

    await tapTab(page, "Inbox");
    await expect(page).toHaveURL(/\/portal\/inbox/);

    await tapTab(page, "Home");
    await expect(page).toHaveURL(/\/portal\/?(\?|$)/);
  });

  test("More sheet opens and closes", async ({ page }) => {
    await page.goto("/portal");
    await openMoreSheet(page);
    await expect(
      page.getByTestId("more-sheet-content").getByRole("link").first(),
    ).toBeVisible();
    await closeMoreSheet(page);
    await expect(page.getByTestId("more-sheet-content")).toBeHidden();
  });

  test("week pager prev link updates URL", async ({ page }) => {
    await page.goto("/portal");
    await page.getByRole("link", { name: "← Prev" }).click();
    await expect(page).toHaveURL(/week=/);
  });

  test("global navigation progress bar appears on tab navigation", async ({
    page,
  }) => {
    await page.goto("/portal");
    // Slow the destination's RSC fetch so the transient top bar is
    // observable; tapTab only dispatches the click (does not await the nav),
    // so the bar should be mounted and animating right after.
    await page.route(/\/portal\/inbox/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    await tapTab(page, "Inbox");
    await expect(page.locator(".nav-progress")).toBeVisible({ timeout: 3000 });
    await page.unroute(/\/portal\/inbox/);
    await expect(page).toHaveURL(/\/portal\/inbox/, { timeout: 15_000 });
    // Bar completes and unmounts once the route commits.
    await expect(page.locator(".nav-progress")).toBeHidden({ timeout: 10_000 });
  });
});
