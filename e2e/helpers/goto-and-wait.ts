import { expect, type Page } from "@playwright/test";

/** Navigate and wait for a stable selector (avoids dev-server networkidle flakes). */
export async function gotoAndWait(
  page: Page,
  path: string,
  waitFor?: string | RegExp,
) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  if (waitFor instanceof RegExp) {
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(waitFor, {
      timeout: 30_000,
    });
  } else if (waitFor) {
    await expect(page.locator(waitFor).first()).toBeVisible({ timeout: 30_000 });
  }
  await page.waitForTimeout(300);
}

/** Warm a route once before assertions (Next dev compiles on first hit). */
export async function warmRoute(page: Page, path: string, heading?: RegExp) {
  await gotoAndWait(page, path, heading);
  await page.reload({ waitUntil: "domcontentloaded" });
  if (heading) {
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading, {
      timeout: 30_000,
    });
  }
}
