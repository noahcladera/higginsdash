import { expect, test } from "@playwright/test";

import { requireMemberLogin } from "./helpers/auth";
import { closeMoreSheet, openMoreSheet } from "./helpers/navigation";

test.describe("mobile More tab", () => {
  test("More tab is a button (client-state overlay, not a URL)", async ({
    page,
  }) => {
    await requireMemberLogin(page);
    await page.goto("/portal");

    const moreButton = page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("button", { name: "More", exact: true });
    await expect(moreButton).toBeVisible();
  });

  test("More tab opens the sheet instantly without changing the URL", async ({
    page,
  }) => {
    await requireMemberLogin(page);
    await page.goto("/portal");
    const urlBefore = page.url();

    await openMoreSheet(page);

    await expect(page.getByRole("dialog", { name: "More" })).toBeVisible();
    // Client-state overlay: opening must NOT navigate / add a query param.
    expect(page.url()).toBe(urlBefore);
  });

  test("More sheet closes via overlay tap", async ({ page }) => {
    await requireMemberLogin(page);
    await page.goto("/portal");
    await openMoreSheet(page);
    await closeMoreSheet(page);
  });

  test("back button closes the More sheet", async ({ page }) => {
    await requireMemberLogin(page);
    await page.goto("/portal");
    await openMoreSheet(page);

    await page.goBack();
    await expect(page.getByTestId("more-sheet-content")).toBeHidden({
      timeout: 10_000,
    });
    // Still on the portal — back closed the sheet, it did not navigate away.
    await expect(page).toHaveURL(/\/portal/);
  });
});
