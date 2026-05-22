import playwrightPkg from "../.pi/extensions/desktop-tools/node_modules/playwright/index.js";
import fs from "node:fs/promises";
import path from "node:path";

const { chromium } = playwrightPkg;

const baseUrl = "http://localhost:3000";
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
const page = await context.newPage();
const logs = [];

const wait = (ms) => page.waitForTimeout(ms);
const log = (m) => logs.push(m);

async function tryClickByRole(names) {
  for (const name of names) {
    const b = page.getByRole("button", { name }).first();
    if (await b.count()) {
      await b.click();
      return true;
    }
  }
  return false;
}

async function ensureLoggedIn() {
  await page.goto(`${baseUrl}/auth/login`, { waitUntil: "domcontentloaded" });
  await wait(1200);

  const email = page.locator('input[type="email"], input[name="email"]').first();
  const pass = page.locator('input[type="password"], input[name="password"]').first();
  if ((await email.count()) && (await pass.count())) {
    await email.fill(creds.email);
    await pass.fill(creds.password);
    await tryClickByRole([/log in/i, /sign in/i, /continue/i]);
    await wait(2000);
  }
}

try {
  await ensureLoggedIn();

  await page.goto(`${baseUrl}/event-types`, { waitUntil: "domcontentloaded" });
  await wait(2000);

  const eventTypeLinks = page.locator('a[href*="/event-types/"]');
  const count = await eventTypeLinks.count();
  log(`event type links: ${count}`);

  if (count === 0) {
    await page.screenshot({ path: path.resolve("artifacts/video-demo/proof-no-event-types.png"), fullPage: true });
    throw new Error("No event types found to demo specific meetings");
  }

  await eventTypeLinks.first().click();
  await wait(1800);

  const specificTab = page.getByText(/specific meetings/i).first();
  if (!(await specificTab.count())) {
    await page.screenshot({ path: path.resolve("artifacts/video-demo/proof-no-specific-tab.png"), fullPage: true });
    throw new Error("Specific Meetings tab not found");
  }

  await specificTab.click();
  await wait(1200);

  const uniqueTitle = `Proof meeting ${Date.now()}`;

  await page.getByLabel(/title/i).first().fill(uniqueTitle);
  await page.getByLabel(/description/i).first().fill("End-to-end proof recording");

  const nameInputs = page.getByLabel(/name/i);
  const emailInputs = page.getByLabel(/email/i);
  await nameInputs.first().fill("Proof Invitee");
  await emailInputs.first().fill(`proof-invitee-${Date.now()}@local.dev`);

  await tryClickByRole([/create specific meeting/i]);
  await wait(2500);

  await tryClickByRole([/copy invite link/i]);
  await wait(900);
  await tryClickByRole([/resend invite/i]);
  await wait(900);
  await tryClickByRole([/^cancel$/i]);
  await wait(1500);

  await page.screenshot({ path: path.resolve("artifacts/video-demo/proof-final-state.png"), fullPage: true });

  const html = await page.content();
  await fs.writeFile(path.resolve("artifacts/video-demo/proof-final.html"), html);
} finally {
  const videoPath = await page.video()?.path();
  await context.close();
  await browser.close();

  const finalPath = path.resolve("artifacts/specific-meetings-demo.webm");
  if (videoPath) {
    await fs.copyFile(videoPath, finalPath);
  }

  console.log(JSON.stringify({
    outputVideo: finalPath,
    rawVideo: videoPath,
    logs,
  }, null, 2));
}
