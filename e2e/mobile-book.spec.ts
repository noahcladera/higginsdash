import { expect, test } from "@playwright/test";

import { requireMemberLogin } from "./helpers/auth";
import { tapTab } from "./helpers/navigation";

async function gotoBookPageWithMembership(page: import("@playwright/test").Page) {
  await requireMemberLogin(page);
  await page.goto("/portal");

  const bookTab = page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Book", exact: true });

  if (!(await bookTab.isVisible().catch(() => false))) {
    test.skip(true, "Book tab hidden — no active membership or courtBookings off");
  }

  await bookTab.click();
  await expect(page).toHaveURL(/\/portal\/book/);

  const membershipGate = page.getByRole("heading", {
    name: /two clubs, one membership/i,
  });
  if (await membershipGate.isVisible()) {
    test.skip(true, "Example user has no membership — seed memberships to run book tests");
  }

  const courtTabs = page.getByRole("tablist", { name: "Court" });
  const availableSlot = page.getByRole("link", { name: "Available" }).first();
  await expect(courtTabs.or(availableSlot).first()).toBeVisible({
    timeout: 45_000,
  });
}

test.describe("mobile book page (Link-first controls)", () => {
  test.describe.configure({ timeout: 60_000 });

  test("club picker navigates via native link", async ({ page }) => {
    await gotoBookPageWithMembership(page);

    const clubTabs = page.getByRole("tablist", { name: "Club" });
    if (!(await clubTabs.isVisible())) {
      test.skip(true, "Single-club member — no club picker");
    }

    const inactiveClub = clubTabs
      .getByRole("tab")
      .filter({ hasNot: page.locator('[aria-selected="true"]') })
      .first();
    const href = await inactiveClub.getAttribute("href");
    expect(href).toMatch(/club=/);
    await inactiveClub.click();
    await page.waitForURL(/club=/);
    expect(page.url()).toContain("club=");
  });

  test("court picker navigates via native link", async ({ page }) => {
    await gotoBookPageWithMembership(page);

    const courtTabs = page.getByRole("tablist", { name: "Court" });
    if (!(await courtTabs.isVisible())) {
      test.skip(true, "Single court — no court picker");
    }

    const inactiveCourt = courtTabs
      .getByRole("tab")
      .filter({ hasNot: page.locator('[aria-selected="true"]') })
      .first();
    const href = await inactiveCourt.getAttribute("href");
    expect(href).toMatch(/court=/);
    await inactiveCourt.click();
    await page.waitForURL(/court=/);
    expect(page.url()).toMatch(/court=/);
  });

  test("available slot link opens booking dialog", async ({ page }) => {
    await gotoBookPageWithMembership(page);

    // Past slots today render as status, not links — use tomorrow.
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
});
