import { expect, type Page } from "@playwright/test";

const IGNORE_PATTERNS = [
  /webpack-hmr/i,
  /WebSocket connection.*failed/i,
  /Failed to load resource.*favicon/i,
];

/** Attach listener; call returned cleanup in afterEach. Fails test on pageerror. */
export function trackConsoleErrors(page: Page) {
  const errors: string[] = [];

  page.on("pageerror", (err) => {
    errors.push(err.message);
  });
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (IGNORE_PATTERNS.some((p) => p.test(text))) return;
    errors.push(text);
  });

  return {
    assertClean() {
      expect(
        errors,
        errors.length ? `Console errors:\n${errors.join("\n")}` : undefined,
      ).toEqual([]);
    },
    get errors() {
      return errors;
    },
  };
}
