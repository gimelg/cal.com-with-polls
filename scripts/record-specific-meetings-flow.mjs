import playwrightPkg from "../.pi/extensions/desktop-tools/node_modules/playwright/index.js";
import path from "node:path";
import fs from "node:fs/promises";

const { chromium } = playwrightPkg;

const baseUrl = "http://localhost:3000";
const outDir = path.resolve("artifacts/video-demo");
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  recordVideo: { dir: outDir, size: { width: 1280, height: 720 } },
});
const page = await context.newPage();

const logs = [];
const step = async (label, fn) => {
  try {
    await fn();
    logs.push({ label, ok: true });
  } catch (error) {
    logs.push({ label, ok: false, error: String(error?.message || error) });
  }
};

try {
  await page.goto(`${baseUrl}/event-types`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  await step("open first event type", async () => {
    const firstEventTypeLink = page.locator('a[href*="/event-types/"]').first();
    await firstEventTypeLink.click();
    await page.waitForTimeout(2200);
  });

  await step("open Specific Meetings tab", async () => {
    const tab = page.getByText(/specific meetings/i).first();
    await tab.click();
    await page.waitForTimeout(1800);
  });

  await step("fill title", async () => {
    await page.getByLabel(/title/i).first().fill("Demo specific meeting");
  });

  await step("fill description", async () => {
    await page.getByLabel(/description/i).first().fill("Recorded demo flow");
  });

  await step("fill participant name", async () => {
    const nameFields = page.getByLabel(/name/i);
    await nameFields.nth(0).fill("Demo Invitee");
  });

  await step("fill participant email", async () => {
    const emailFields = page.getByLabel(/email/i);
    await emailFields.nth(0).fill("invitee-demo@local.dev");
  });

  await step("create specific meeting", async () => {
    await page.getByRole("button", { name: /create specific meeting/i }).first().click();
    await page.waitForTimeout(2600);
  });

  await step("cancel specific meeting", async () => {
    await page.getByRole("button", { name: /^cancel$/i }).first().click();
    await page.waitForTimeout(1600);
  });

  await step("resend invite", async () => {
    await page.getByRole("button", { name: /resend invite/i }).first().click();
    await page.waitForTimeout(1400);
  });

  await page.screenshot({ path: path.resolve("artifacts/video-demo/specific-meetings-flow.png"), fullPage: true });
} finally {
  const videoPath = await page.video()?.path();
  await context.close();
  await browser.close();
  console.log(JSON.stringify({ videoPath, logs }, null, 2));
}
