import playwrightPkg from "../.pi/extensions/desktop-tools/node_modules/playwright/index.js";
import fs from "node:fs/promises";
import path from "node:path";

const { chromium } = playwrightPkg;

const baseUrl = "http://localhost:3000";
const eventTypeId = 3;
const eventUrl = `${baseUrl}/event-types/${eventTypeId}?tabName=specificMeetings`;
const outDir = path.resolve("artifacts/video-demo");
await fs.mkdir(outDir, { recursive: true });

const creds = { email: "test-admin@local.dev", password: "TestAdmin12345!" };

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  recordVideo: { dir: outDir, size: { width: 1280, height: 720 } },
});
const page = await context.newPage();
const logs = [];
const wait = (ms) => page.waitForTimeout(ms);

try {
  await page.goto(`${baseUrl}/auth/login`, { waitUntil: "domcontentloaded" });
  await wait(1000);

  const email = page.locator('input[type="email"], input[name="email"]').first();
  const pass = page.locator('input[type="password"], input[name="password"]').first();
  if ((await email.count()) && (await pass.count())) {
    await email.fill(creds.email);
    await pass.fill(creds.password);
    const loginBtn = page.getByRole("button", { name: /log in|sign in|continue/i }).first();
    if (await loginBtn.count()) await loginBtn.click();
    await wait(1800);
  }

  await page.goto(eventUrl, { waitUntil: "domcontentloaded" });
  await wait(1800);

  const unique = Date.now();
  const textboxes = page.getByRole("textbox");
  await textboxes.nth(0).fill(`Proof meeting ${unique}`);
  await textboxes.nth(1).fill("Automated E2E proof recording");
  await textboxes.nth(3).fill("Proof Invitee");
  await textboxes.nth(4).fill(`proof-invitee-${unique}@local.dev`);

  await page.getByRole("button", { name: /create specific meeting/i }).first().click();
  await wait(2500);
  logs.push("meeting created");

  const listResponse = await page.evaluate(async (eventTypeId) => {
    const input = encodeURIComponent(
      JSON.stringify({ 0: { json: { eventTypeId } } })
    );
    const response = await fetch(`/api/trpc/viewer/specificMeetings.listByEventType?batch=1&input=${input}`);
    return await response.json();
  }, eventTypeId);

  const meetings = listResponse?.[0]?.result?.data?.json || [];
  const newest = meetings[0];
  const invitee = newest?.invitees?.[0];
  const responseUrl = invitee?.responseUrl;
  logs.push(`responseUrl: ${responseUrl || "none"}`);

  if (responseUrl) {
    const publicPage = await context.newPage();
    await publicPage.goto(`${baseUrl}${responseUrl}`, { waitUntil: "domcontentloaded" });
    await publicPage.waitForTimeout(1500);
    const yesBtn = publicPage.getByRole("button", { name: /^yes$/i }).first();
    if (await yesBtn.count()) {
      await yesBtn.click();
      await publicPage.waitForTimeout(1500);
      logs.push("public RSVP accepted");
    }
    await publicPage.close();
  }

  await page.bringToFront();
  await page.goto(eventUrl, { waitUntil: "domcontentloaded" });
  await wait(1200);

  const resend = page.getByRole("button", { name: /resend invite/i }).first();
  if (await resend.count()) {
    await resend.click();
    await wait(900);
    logs.push("invite resent");
  }

  const cancel = page.getByRole("button", { name: /^cancel$/i }).first();
  if (await cancel.count()) {
    await cancel.click();
    await wait(1200);
    logs.push("meeting cancelled");
  }

  await page.screenshot({ path: path.resolve("artifacts/video-demo/e2e-final.png"), fullPage: true });
} finally {
  const raw = await page.video()?.path();
  await context.close();
  await browser.close();

  const out = path.resolve("artifacts/specific-meetings-demo.webm");
  if (raw) await fs.copyFile(raw, out);

  console.log(JSON.stringify({ outputVideo: out, rawVideo: raw, logs }, null, 2));
}
