import playwrightPkg from "../.pi/extensions/desktop-tools/node_modules/playwright/index.js";
import fs from "node:fs/promises";
import path from "node:path";

const { chromium } = playwrightPkg;
const baseUrl = "http://localhost:3000";
const eventUrl = `${baseUrl}/event-types/3?tabName=specificMeetings`;
const outDir = path.resolve("artifacts/video-demo");
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ recordVideo: { dir: outDir, size: { width: 1280, height: 720 } } });
const page = await context.newPage();
const logs = [];

try {
  await page.goto(`${baseUrl}/auth/login`);
  const email = page.locator('input[type="email"],input[name="email"]').first();
  const pass = page.locator('input[type="password"]').first();
  if ((await email.count()) && (await pass.count())) {
    await email.fill("test-admin@local.dev");
    await pass.fill("TestAdmin12345!");
    const btn = page.getByRole("button", { name: /log in|sign in|continue/i }).first();
    if (await btn.count()) await btn.click();
    await page.waitForTimeout(1200);
  }

  await page.goto(eventUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);

  const resend = page.getByRole("button", { name: /resend invite/i }).first();
  if (await resend.count()) {
    await resend.click();
    await page.waitForTimeout(1200);
    logs.push("resend clicked");
  }

  const cancel = page.getByRole("button", { name: /^cancel$/i }).first();
  if (await cancel.count()) {
    await cancel.click();
    await page.waitForTimeout(1500);
    logs.push("cancel clicked");
  }

  await page.screenshot({ path: path.resolve("artifacts/video-demo/cancel-resend-final.png"), fullPage: true });
} finally {
  const rawVideo = await page.video()?.path();
  await context.close();
  await browser.close();

  const out = path.resolve("artifacts/specific-meetings-cancel-resend-demo.webm");
  if (rawVideo) await fs.copyFile(rawVideo, out);
  console.log(JSON.stringify({ outputVideo: out, rawVideo, logs }, null, 2));
}
