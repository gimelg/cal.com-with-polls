import playwrightPkg from "../.pi/extensions/desktop-tools/node_modules/playwright/index.js";
import fs from "node:fs/promises";
import path from "node:path";

const { chromium } = playwrightPkg;

const baseUrl = "http://localhost:3000";
const eventTypeId = 3;
const eventUrl = `${baseUrl}/event-types/${eventTypeId}?tabName=specificMeetings`;
const creds = { email: "test-admin@local.dev", password: "TestAdmin12345!" };
const runsRoot = path.resolve("artifacts/e2e-screens");
await fs.mkdir(runsRoot, { recursive: true });

const ERROR_PATTERNS = [
  /an unexpected error occurred/i,
  /something went wrong/i,
  /unable to/i,
  /failed/i,
  /exception/i,
  /500/i,
];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function runAttempt(attempt) {
  const runDir = path.join(runsRoot, `run-${String(attempt).padStart(2, "0")}`);
  await fs.mkdir(runDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    recordVideo: { dir: runDir, size: { width: 1280, height: 720 } },
  });

  const organizer = await context.newPage();
  const errors = [];
  const logs = [];

  organizer.on("console", (msg) => {
    const type = msg.type();
    const text = msg.text();
    if (type !== "error") return;
    if (text.includes("Accessing element.ref was removed in React 19")) return;
    if (text.includes("Failed to load resource: the server responded with a status of 404")) return;
    errors.push(`[console.error] ${text}`);
  });
  organizer.on("pageerror", (err) => errors.push(`[pageerror] ${err.message}`));
  organizer.on("response", (res) => {
    if (res.status() >= 500) errors.push(`[http ${res.status()}] ${res.url()}`);
  });

  let frame = 0;
  let captureActive = true;
  const captureLoop = (async () => {
    while (captureActive) {
      frame += 1;
      try {
        await organizer.screenshot({
          path: path.join(runDir, `frame-${String(frame).padStart(4, "0")}.png`),
          fullPage: true,
        });
      } catch {
        // ignore transient screenshot errors
      }
      await delay(1000);
    }
  })();

  const checkDomForErrors = async (label) => {
    const text = await organizer.locator("body").innerText();
    for (const pattern of ERROR_PATTERNS) {
      if (pattern.test(text)) {
        errors.push(`[dom:${label}] matched ${pattern}`);
      }
    }
  };

  const safeStep = async (label, fn, slowMs = 3000) => {
    try {
      await fn();
      await delay(slowMs); // 3x slower pacing
      await checkDomForErrors(label);
      logs.push(`ok: ${label}`);
      return true;
    } catch (e) {
      errors.push(`[step:${label}] ${e?.message || String(e)}`);
      return false;
    }
  };

  try {
    await safeStep("open login", async () => {
      await organizer.goto(`${baseUrl}/auth/login`, { waitUntil: "domcontentloaded" });
    });

    const emailInput = organizer.locator('input[type="email"], input[name="email"]').first();
    const passInput = organizer.locator('input[type="password"], input[name="password"]').first();

    if ((await emailInput.count()) && (await passInput.count())) {
      await safeStep("fill login email", async () => {
        await emailInput.fill(creds.email);
      });
      await safeStep("fill login password", async () => {
        await passInput.fill(creds.password);
      });
      await safeStep("submit login", async () => {
        await organizer.getByRole("button", { name: /log in|sign in|continue/i }).first().click();
      }, 4000);
    }

    await safeStep("open specific meetings tab", async () => {
      await organizer.goto(eventUrl, { waitUntil: "domcontentloaded" });
    }, 4000);

    const meetingCard = organizer
      .locator("div.rounded-lg.border.border-subtle.p-4")
      .filter({ has: organizer.getByText("SCHEDULED", { exact: true }) })
      .first();

    await safeStep("wait for scheduled meeting", async () => {
      await meetingCard.waitFor({ state: "visible", timeout: 30000 });
    }, 4000);

    await safeStep("resend invite", async () => {
      await meetingCard.getByRole("button", { name: /resend invite/i }).click();
    });

    await safeStep("cancel meeting", async () => {
      await meetingCard.getByRole("button", { name: /^cancel$/i }).click();
    }, 4000);

    await organizer.screenshot({ path: path.join(runDir, "final.png"), fullPage: true });
  } finally {
    captureActive = false;
    await captureLoop;

    const rawVideo = await organizer.video()?.path();
    await context.close();
    await browser.close();

    const finalVideo = path.resolve("artifacts/specific-meetings-e2e-clean.webm");
    if (rawVideo) await fs.copyFile(rawVideo, finalVideo);

    await fs.writeFile(
      path.join(runDir, "result.json"),
      JSON.stringify({ attempt, errors, logs, rawVideo, finalVideo }, null, 2)
    );
  }

  return { errors, runDir };
}

let success = false;
let finalRun = null;
for (let attempt = 1; attempt <= 3; attempt++) {
  const result = await runAttempt(attempt);
  finalRun = result.runDir;
  if (result.errors.length === 0) {
    success = true;
    break;
  }
}

console.log(JSON.stringify({ success, finalRun, outputVideo: path.resolve("artifacts/specific-meetings-e2e-clean.webm") }, null, 2));
if (!success) process.exitCode = 1;
