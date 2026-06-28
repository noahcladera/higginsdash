import { expect, test } from "@playwright/test";

import { requireMemberLogin } from "./helpers/auth";
import { warmRoute } from "./helpers/goto-and-wait";

test.describe("mobile account routes", () => {
  test.beforeEach(async ({ page }) => {
    await requireMemberLogin(page);
  });

  test("profile page loads", async ({ page }) => {
    await warmRoute(page, "/portal/profile");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("membership page loads with buy section", async ({ page }) => {
    await warmRoute(page, "/portal/membership");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator("#buy")).toBeAttached();
  });

  test("membership buy menu expands via client toggle", async ({ page }) => {
    await warmRoute(page, "/portal/membership");
    const toggle = page.getByTestId("membership-buy-toggle");
    if (await toggle.isVisible().catch(() => false)) {
      const urlBefore = page.url();
      if (/show options/i.test((await toggle.textContent()) ?? "")) {
        await toggle.click();
        // Client toggle: expands instantly, no RSC-refetching navigation.
        expect(page.url()).toBe(urlBefore);
      }
    }
    await expect(page.getByText("Both clubs").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("inbox page loads", async ({ page }) => {
    await warmRoute(page, "/portal/inbox");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("family page loads for parent", async ({ page }) => {
    await warmRoute(page, "/portal/family");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 15_000,
    });
  });
});
