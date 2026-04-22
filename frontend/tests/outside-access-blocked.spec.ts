import { test, expect } from "@playwright/test";

test("blocks access outside the allowed app session", async ({ page }) => {
  await page.goto("https://albufeirashop.xyz/app-v-b3lzupc8", { waitUntil: "networkidle" });

  await expect(page.getByText(/access blocked|доступ заблокирован/i)).toBeVisible();
  await expect(
    page.getByText(/workspace is currently unavailable|рабочее пространство сейчас недоступно/i)
  ).toBeVisible();
});
