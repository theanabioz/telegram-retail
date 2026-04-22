import { test, expect } from "@playwright/test";

test("blocks access outside the allowed app session", async ({ page }) => {
  await page.goto("https://albufeirashop.xyz/", { waitUntil: "networkidle" });

  await expect(page.getByRole("img", { name: /access blocked/i })).toBeVisible();
  await expect(
    page.getByText(/this workplace is currently unavailable for this session\./i)
  ).toBeVisible();
});
