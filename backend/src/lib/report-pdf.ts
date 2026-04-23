import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type PlaywrightPage = {
  setContent(html: string, options?: { waitUntil?: "load" | "domcontentloaded" | "networkidle" }): Promise<void>;
  pdf(options?: {
    format?: string;
    printBackground?: boolean;
    margin?: { top?: string; right?: string; bottom?: string; left?: string };
  }): Promise<Buffer>;
};

type PlaywrightBrowser = {
  newPage(): Promise<PlaywrightPage>;
  close(): Promise<void>;
};

type PlaywrightModule = {
  chromium: {
    launch(options?: { headless?: boolean }): Promise<PlaywrightBrowser>;
  };
};

const require = createRequire(import.meta.url);
const moduleDir = dirname(fileURLToPath(import.meta.url));

async function loadPlaywright(): Promise<PlaywrightModule | null> {
  try {
    const lookupPaths = [
      process.cwd(),
      resolve(process.cwd(), "../frontend"),
      resolve(moduleDir, "../../../frontend"),
    ];
    const resolvedPath = require.resolve("playwright", {
      paths: lookupPaths,
    });

    return (await import(resolvedPath)) as PlaywrightModule;
  } catch {
    return null;
  }
}

export async function createPdfFromHtml(html: string) {
  const playwright = await loadPlaywright();
  if (!playwright) {
    return null;
  }

  let browser: PlaywrightBrowser | null = null;

  try {
    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    return await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "16px",
        right: "16px",
        bottom: "16px",
        left: "16px",
      },
    });
  } catch {
    return null;
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}
