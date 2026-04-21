import { test, expect } from "@playwright/test";

const APP_URL = "http://127.0.0.1:5173";

async function clickVisible(page: import("@playwright/test").Page, label: RegExp) {
  const button = page.getByRole("button", { name: label }).first();
  if (await button.isVisible().catch(() => false)) {
    await button.click();
    return;
  }

  const text = page.getByText(label).first();
  await text.click();
}

async function openSettings(page: import("@playwright/test").Page) {
  await clickVisible(page, /settings|настройки|definições/i);
  await expect(page.getByText(/language|язык|idioma/i).first()).toBeVisible();
}

async function switchLocale(page: import("@playwright/test").Page, localeLabel: RegExp) {
  await openSettings(page);
  await clickVisible(page, localeLabel);
  await page.waitForTimeout(400);
}

async function captureAdminTabs(page: import("@playwright/test").Page, localeKey: string) {
  const adminTabs = [
    /overview|обзор|visão geral/i,
    /sales|продажи|vendas/i,
    /inventory|склад|inventário/i,
    /team|команда|equipa/i,
    /settings|настройки|definições/i,
  ];

  for (const tab of adminTabs) {
    await clickVisible(page, tab);
    await page.waitForTimeout(500);
  }

  await page.screenshot({
    path: `../test-results/${localeKey}-admin-overview.png`,
    fullPage: true,
  });

  await clickVisible(page, /sales|продажи|vendas/i);
  await page.waitForTimeout(500);
  await page.screenshot({
    path: `../test-results/${localeKey}-admin-sales.png`,
    fullPage: true,
  });

  await clickVisible(page, /inventory|склад|inventário/i);
  await page.waitForTimeout(500);
  await page.screenshot({
    path: `../test-results/${localeKey}-admin-inventory.png`,
    fullPage: true,
  });

  await clickVisible(page, /team|команда|equipa/i);
  await page.waitForTimeout(500);
  await page.screenshot({
    path: `../test-results/${localeKey}-admin-team.png`,
    fullPage: true,
  });
}

async function captureSellerTabs(page: import("@playwright/test").Page, localeKey: string) {
  const sellerNav = [
    /checkout|касса|checkout/i,
    /orders|заказы|pedidos/i,
    /stock|мой склад|meu stock/i,
    /shift|смена|turno/i,
    /settings|настройки|definições/i,
  ];

  for (const tab of sellerNav) {
    await clickVisible(page, tab);
    await page.waitForTimeout(500);
  }

  await clickVisible(page, /checkout|касса/i);
  await page.waitForTimeout(500);
  await page.screenshot({
    path: `../test-results/${localeKey}-seller-checkout.png`,
    fullPage: true,
  });

  await clickVisible(page, /orders|заказы|pedidos/i);
  await page.waitForTimeout(500);
  await page.screenshot({
    path: `../test-results/${localeKey}-seller-orders.png`,
    fullPage: true,
  });

  await clickVisible(page, /stock|мой склад|meu stock/i);
  await page.waitForTimeout(500);
  await page.screenshot({
    path: `../test-results/${localeKey}-seller-stock.png`,
    fullPage: true,
  });

  await clickVisible(page, /shift|смена|turno/i);
  await page.waitForTimeout(500);
  await page.screenshot({
    path: `../test-results/${localeKey}-seller-shift.png`,
    fullPage: true,
  });
}

test("locale audit for russian and portuguese", async ({ page }) => {
  test.setTimeout(120000);

  page.on("console", (message) => {
    console.log("BROWSER_CONSOLE", message.type(), message.text());
  });
  page.on("pageerror", (error) => {
    console.log("PAGE_ERROR", error.message);
  });

  await page.goto(APP_URL, { waitUntil: "networkidle" });
  await page.screenshot({ path: "../test-results/initial-load.png", fullPage: true });
  console.log("INITIAL_TEXT", (await page.locator("body").innerText()).slice(0, 1000));
  await expect(page.getByText(/overview|обзор|visão geral/i).first()).toBeVisible({ timeout: 15000 });

  await switchLocale(page, /russian|рус/i);
  await captureAdminTabs(page, "ru");

  await clickVisible(page, /команда/i);
  await page.waitForTimeout(300);
  const sellerCard = page.getByRole("button", { name: /anna seller/i }).first();
  if (await sellerCard.isVisible().catch(() => false)) {
    await sellerCard.click();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: "../test-results/ru-admin-seller-detail.png",
      fullPage: true,
    });
  }

  const backButton = page.getByText(/back|назад/i).first();
  if (await backButton.isVisible().catch(() => false)) {
    await backButton.click();
    await page.waitForTimeout(300);
  }

  await clickVisible(page, /настройки/i);
  await page.waitForTimeout(300);
  const switchToSeller = page.getByRole("button", { name: /seller|продав/i }).first();
  if (await switchToSeller.isVisible().catch(() => false)) {
    await switchToSeller.click();
    await page.waitForTimeout(1200);
    await captureSellerTabs(page, "ru");
  }

  await switchLocale(page, /portuguese|português|португаль/i);
  await captureSellerTabs(page, "pt");
});
