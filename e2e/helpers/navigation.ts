import { expect, type Page } from "@playwright/test";

/** Tap a bottom tab by visible label. */
export async function tapTab(page: Page, label: string) {
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: label, exact: true })
    .click();
}

/** Open More sheet — client-state overlay (instant, no RSC refetch). */
export async function openMoreSheet(page: Page) {
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("button", { name: "More", exact: true })
    .click();
  await expect(page.getByTestId("more-sheet-content")).toBeVisible({
    timeout: 15_000,
  });
}

/** Dismiss More sheet via overlay tap (Escape is unreliable in mobile WebKit). */
export async function closeMoreSheet(page: Page) {
  await page.getByTestId("more-sheet-overlay").click({ force: true });
  await expect(page.getByTestId("more-sheet-content")).toBeHidden({
    timeout: 10_000,
  });
}

/** Assert closed Radix overlays do not steal taps. */
export async function assertNoStuckOverlays(page: Page) {
  const closedOverlays = page.locator(
    '[data-slot="bottom-sheet-overlay"][data-state="closed"]',
  );
  for (const el of await closedOverlays.all()) {
    await expect(el).toHaveCSS("pointer-events", "none");
  }
}
