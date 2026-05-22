import playwrightPkg from "../.pi/extensions/desktop-tools/node_modules/playwright/index.js";
import fs from "node:fs/promises";
import path from "node:path";

const { chromium } = playwrightPkg;

const baseUrl = "http://localhost:3000";
const eventTypeId = 3;
const eventUrl = `${baseUrl}/event-types/${eventTypeId}?tabName=specificMeetings`;
const outDir = path.resolve("artifacts/video-demo");
await fs.mkdir(outDir, { recursive: true });

const creds = {
  email: "test-admin@local.dev",
  password: "TestAdmin12345!",
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  recordVideo: { dir: outDir, size: { width: 1280, height: 720 } },
});

const organizerPage = await context.newPage();
const wait = (ms) => organizerPage.waitForTimeout(ms);

const getLatestInvitePathFromTrpc = async (page, eventTypeId) => {
  const payload = await page.evaluate(async (id) => {
    const input = encodeURIComponent(JSON.stringify({ 0: { json: { eventTypeId: id } } }));
    const res = await fetch(`/api/trpc/viewer/specificMeetings.listByEventType?batch=1&input=${input}`);
    return await res.json();
  }, eventTypeId);

  const meetings = payload?.[0]?.result?.data?.json || [];
  const meeting = meetings[0];
  const invitee = meeting?.invitees?.[0];
  if (!meeting || !invitee) return null;

  if (invitee.responseUrl) return invitee.responseUrl;
  if (invitee.responseToken) return `/meeting/${meeting.uid}?token=${invitee.responseToken}`;
  return null;
};

try {
  await organizerPage.goto(`${baseUrl}/auth/login`, { waitUntil: "domcontentloaded" });
  await wait(1200);

  const email = organizerPage.locator('input[type="email"], input[name="email"]').first();
  const pass = organizerPage.locator('input[type="password"], input[name="password"]').first();
  if ((await email.count()) && (await pass.count())) {
    await email.fill(creds.email);
    await pass.fill(creds.password);
    const loginBtn = organizerPage.getByRole("button", { name: /log in|sign in|continue/i }).first();
    if (await loginBtn.count()) await loginBtn.click();
    await wait(2200);
  }

  await organizerPage.goto(eventUrl, { waitUntil: "domcontentloaded" });
  await wait(2600);

  const textboxes = organizerPage.getByRole("textbox");
  const unique = Date.now();
  await textboxes.nth(0).fill(`Polished proof meeting ${unique}`);
  await wait(500);
  await textboxes.nth(1).fill("Human-paced end-to-end demo recording");
  await wait(500);
  await textboxes.nth(3).fill("Polished Invitee");
  await wait(500);
  await textboxes.nth(4).fill(`polished-invitee-${unique}@local.dev`);
  await wait(600);

  await organizerPage.getByRole("button", { name: /create specific meeting/i }).first().click();
  await wait(3500);

  const invitePath = await getLatestInvitePathFromTrpc(organizerPage, eventTypeId);

  if (invitePath) {
    const inviteePage = await context.newPage();
    await inviteePage.goto(`${baseUrl}${invitePath}`, { waitUntil: "domcontentloaded" });
    await inviteePage.waitForTimeout(2500);
    const yes = inviteePage.getByRole("button", { name: /^yes$/i }).first();
    if (await yes.count()) {
      await yes.click();
      await inviteePage.waitForTimeout(1800);
    }
    await inviteePage.close();
  }

  await organizerPage.bringToFront();
  await organizerPage.goto(eventUrl, { waitUntil: "domcontentloaded" });
  await wait(2400);

  const resend = organizerPage.getByRole("button", { name: /resend invite/i }).first();
  if (await resend.count()) {
    await resend.click();
    await wait(1400);
  }

  const cancel = organizerPage.getByRole("button", { name: /^cancel$/i }).first();
  if (await cancel.count()) {
    await cancel.click();
    await wait(2000);
  }

  await organizerPage.screenshot({ path: path.resolve("artifacts/video-demo/polished-final.png"), fullPage: true });
} finally {
  const rawVideo = await organizerPage.video()?.path();
  await context.close();
  await browser.close();

  const finalVideo = path.resolve("artifacts/specific-meetings-polished-demo.webm");
  if (rawVideo) {
    await fs.copyFile(rawVideo, finalVideo);
  }

  console.log(JSON.stringify({ finalVideo, rawVideo }, null, 2));
}
