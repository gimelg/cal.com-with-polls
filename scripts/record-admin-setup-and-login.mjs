import playwrightPkg from "../.pi/extensions/desktop-tools/node_modules/playwright/index.js";
const { chromium } = playwrightPkg;
import path from "node:path";
import fs from "node:fs/promises";

const baseUrl = "http://localhost:3000";
const outDir = path.resolve("artifacts/video-demo");
const creds = {
  name: "Test Admin",
  email: "test-admin@local.dev",
  password: "TestAdmin123!",
};

await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  recordVideo: { dir: outDir, size: { width: 1280, height: 720 } },
});
const page = await context.newPage();

const fillFirstVisible = async (selectors, value) => {
  for (const selector of selectors) {
    const loc = page.locator(selector).first();
    if (await loc.count()) {
      try {
        await loc.fill(value);
        return true;
      } catch {
        // continue
      }
    }
  }
  return false;
};

try {
  await page.goto(`${baseUrl}/auth/login`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  await fillFirstVisible([
    'input[name="name"]',
    'input[id*="name"]',
    'input[placeholder*="name" i]',
    'input[type="text"]',
  ], creds.name);

  await fillFirstVisible([
    'input[name="email"]',
    'input[type="email"]',
    'input[id*="email"]',
    'input[placeholder*="email" i]',
  ], creds.email);

  await fillFirstVisible([
    'input[name="password"]',
    'input[type="password"]',
    'input[id*="password"]',
    'input[placeholder*="password" i]',
  ], creds.password);

  const candidateButtons = [
    /create/i,
    /continue/i,
    /get started/i,
    /sign up/i,
    /register/i,
  ];

  for (const r of candidateButtons) {
    const b = page.getByRole("button", { name: r }).first();
    if (await b.count()) {
      await b.click();
      break;
    }
  }

  await page.waitForTimeout(5000);
  await page.goto(`${baseUrl}/event-types`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);

  await page.screenshot({ path: path.resolve("artifacts/video-demo/admin-after-login.png"), fullPage: true });
} finally {
  const videoPath = await page.video()?.path();
  await context.close();
  await browser.close();
  console.log(JSON.stringify({
    credentials: creds,
    videoPath,
    screenshot: path.resolve("artifacts/video-demo/admin-after-login.png"),
  }, null, 2));
}
