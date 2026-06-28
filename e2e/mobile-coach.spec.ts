import { expect, test } from "@playwright/test";

import { requireCoachLogin } from "./helpers/auth";
import { openMoreSheet, tapTab } from "./helpers/navigation";
import { warmRoute } from "./helpers/goto-and-wait";

test.describe("mobile coach shell", () => {
  test.beforeEach(async ({ page }) => {
    await requireCoachLogin(page);
    await warmRoute(page, "/coach");
  });

  test("tab bar navigates Today, Calendar, Inbox", async ({ page }) => {
    await tapTab(page, "Calendar");
    await expect(page).toHaveURL(/\/coach\/calendar/);

    await tapTab(page, "Inbox");
    await expect(page).toHaveURL(/\/coach\/inbox/);

    await tapTab(page, "Today");
    await expect(page).toHaveURL(/\/coach\/?(\?|$)/);
  });

  test("Book tab loads coach book page", async ({ page }) => {
    const bookTab = page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Book", exact: true });

    if (!(await bookTab.isVisible().catch(() => false))) {
      test.skip(true, "Book tab hidden — courtBookings/invoicing feature off");
    }

    await bookTab.click();
    await expect(page).toHaveURL(/\/coach\/book/);
    await expect(page.locator("main")).toBeVisible({ timeout: 30_000 });
  });

  test("available slot link opens coach booking sheet", async ({ page }) => {
    const bookTab = page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Book", exact: true });

    if (!(await bookTab.isVisible().catch(() => false))) {
      test.skip(true, "Book tab hidden — courtBookings/invoicing feature off");
    }

    await bookTab.click();
    await expect(page).toHaveURL(/\/coach\/book/);

    const availableToday = page.getByRole("link", { name: "Available" });
    if ((await availableToday.count()) === 0) {
      await page.getByRole("link", { name: "Next day" }).click();
      await page.waitForURL(/date=/);
    }

    const available = page.getByRole("link", { name: "Available" }).first();
    await expect(available).toBeVisible({ timeout: 15_000 });
    const href = await available.getAttribute("href");
    expect(href).toMatch(/slot=/);

    await available.click();
    await expect(page.getByTestId("booking-dialog-sheet")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByTestId("booking-dialog-sheet").getByRole("heading", {
        name: /^book /i,
      }),
    ).toBeVisible();
  });

  test("booking sheet Add button adds a student", async ({ page }) => {
    const bookTab = page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Book", exact: true });

    if (!(await bookTab.isVisible().catch(() => false))) {
      test.skip(true, "Book tab hidden — courtBookings/invoicing feature off");
    }

    await bookTab.click();
    await expect(page).toHaveURL(/\/coach\/book/);

    const availableToday = page.getByRole("link", { name: "Available" });
    if ((await availableToday.count()) === 0) {
      await page.getByRole("link", { name: "Next day" }).click();
      await page.waitForURL(/date=/);
    }

    const available = page.getByRole("link", { name: "Available" }).first();
    await expect(available).toBeVisible({ timeout: 15_000 });
    await available.click();

    const sheet = page.getByTestId("booking-dialog-sheet");
    await expect(sheet).toBeVisible({ timeout: 15_000 });

    const nameInput = sheet.getByPlaceholder(/name of/i);
    await nameInput.click();
    await nameInput.pressSequentially("misha", { delay: 30 });
    await sheet.getByTestId("party-add").click();

    await expect(sheet.getByText("misha", { exact: true })).toBeVisible();
  });

  test("More sheet opens on coach workspace", async ({ page }) => {
    await page.goto("/coach");
    await openMoreSheet(page);
    await expect(page.getByTestId("more-sheet-content")).toBeVisible({
      timeout: 15_000,
    });
  });
});
