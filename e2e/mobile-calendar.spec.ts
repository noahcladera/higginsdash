import { expect, test } from "@playwright/test";

import { requireMemberLogin } from "./helpers/auth";

test.describe("mobile Add to calendar", () => {
  test("opens subscribe dialog with platform buttons", async ({ page }) => {
    await requireMemberLogin(page);
    await page.goto("/portal");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 30_000,
    });

    const trigger = page.getByTestId("add-to-calendar-trigger").or(
      page.getByRole("button", { name: /add to calendar/i }),
    ).first();
    if (!(await trigger.isVisible().catch(() => false))) {
      test.skip(
        true,
        "Add to calendar not shown for this persona (needs parent/student household)",
      );
    }

    const urlBefore = page.url();
    await trigger.click();
    // Client-state overlay: opens instantly without an RSC-refetching nav.
    await expect(page.getByTestId("add-to-calendar-sheet")).toBeVisible({
      timeout: 15_000,
    });
    expect(page.url()).toBe(urlBefore);
    await expect(page.getByRole("heading", { name: "Add to calendar" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /google calendar/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /apple calendar/i }),
    ).toBeVisible();
  });
});
