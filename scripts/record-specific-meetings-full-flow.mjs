import playwrightPkg from "../.pi/extensions/desktop-tools/node_modules/playwright/index.js";
import fs from "node:fs/promises";
import path from "node:path";

const { chromium } = playwrightPkg;

const baseUrl = "http://localhost:3000";
const eventTypeId = 3;
const eventUrl = `${baseUrl}/event-types/${eventTypeId}?tabName=specificMeetings`;
const creds = { email: "test-admin@local.dev", password: "TestAdmin12345!" };
const runsRoot = path.resolve("artifacts/e2e-screens");
const finalVideo = path.resolve("artifacts/specific-meetings-full-flow.webm");

const ERROR_PATTERNS = [/an unexpected error occurred/i, /something went wrong/i, /unable to/i, /exception/i];
const IGNORE_CONSOLE_ERRORS = [
  "Accessing element.ref was removed in React 19",
  "Failed to load resource: the server responded with a status of 404",
  "react-i18next:: You will need to pass in an i18next instance by using initReactI18next",
  "`markdownToSafeHTML` should not be imported on the client side.",
  "React does not recognize the `%s` prop on a DOM element",
];

await fs.mkdir(runsRoot, { recursive: true });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function apiLogin(page) {
  const csrf = await (await page.context().request.get(`${baseUrl}/api/auth/csrf`)).json();
  const response = await page.context().request.post(`${baseUrl}/api/auth/callback/credentials`, {
    form: {
      email: creds.email,
      password: creds.password,
      callbackURL: baseUrl,
      redirect: "false",
      json: "true",
      csrfToken: csrf.csrfToken,
    },
  });

  if (response.status() !== 200) throw new Error(`apiLogin failed with ${response.status()}`);
  await page.goto(`${baseUrl}/e2e/session-warmup`, { waitUntil: "domcontentloaded" });
  await delay(1500);
}

async function listMeetings(page) {
  const data = await page.evaluate(async (inputEventTypeId) => {
    const input = encodeURIComponent(JSON.stringify({ 0: { json: { eventTypeId: inputEventTypeId } } }));
    const res = await fetch(`/api/trpc/specificMeetings/listByEventType?batch=1&input=${input}`);
    return await res.json();
  }, eventTypeId);

  return data?.[0]?.result?.data?.json || [];
}

async function runAttempt(attempt) {
  const runDir = path.join(runsRoot, `run-${String(attempt).padStart(2, "0")}`);
  await fs.mkdir(runDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ recordVideo: { dir: runDir, size: { width: 1280, height: 720 } } });
  const page = await context.newPage();
  const errors = [];
  const logs = [];
  let rescheduleCompleted = false;

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (IGNORE_CONSOLE_ERRORS.some((item) => text.includes(item))) return;
    errors.push(`[console.error] ${text}`);
  });
  page.on("pageerror", (err) => errors.push(`[pageerror] ${err.message}`));
  page.on("response", (res) => {
    if (res.status() >= 500) errors.push(`[http ${res.status()}] ${res.url()}`);
  });

  let frame = 0;
  let captureActive = true;
  const captureLoop = (async () => {
    while (captureActive) {
      frame += 1;
      try {
        await page.screenshot({
          path: path.join(runDir, `frame-${String(frame).padStart(4, "0")}.png`),
          fullPage: true,
        });
      } catch {}
      await delay(1000);
    }
  })();

  const checkDomForErrors = async (label) => {
    const text = await page.locator("body").innerText().catch(() => "");
    for (const pattern of ERROR_PATTERNS) {
      if (pattern.test(text)) errors.push(`[dom:${label}] matched ${pattern}`);
    }
  };

  const safeStep = async (label, action, slowMs = 3000) => {
    try {
      await action();
      await delay(slowMs);
      await checkDomForErrors(label);
      logs.push(`ok: ${label}`);
      return true;
    } catch (error) {
      errors.push(`[step:${label}] ${error?.message || String(error)}`);
      return false;
    }
  };

  try {
    await safeStep("api login", async () => {
      await apiLogin(page);
    }, 2000);

    await safeStep("open specific meetings tab", async () => {
      await page.goto(eventUrl, { waitUntil: "domcontentloaded" });
    }, 4000);

    let acceptMeeting;
    let declineMeeting;
    let cancelMeeting;

    await safeStep("pick existing meetings", async () => {
      const meetings = await listMeetings(page);
      acceptMeeting = meetings.find((meeting) => meeting.status === "SCHEDULED" && meeting.booking?.uid && meeting.invitees[0]?.status === "PENDING");
      declineMeeting = meetings.find(
        (meeting) => meeting.status === "SCHEDULED" && meeting.invitees[0]?.status === "PENDING" && meeting.uid !== acceptMeeting?.uid
      );
      cancelMeeting = meetings.find(
        (meeting) => meeting.status === "SCHEDULED" && meeting.booking?.uid && meeting.uid !== acceptMeeting?.uid
      );

      if (!acceptMeeting || !declineMeeting || !cancelMeeting) {
        throw new Error("Could not find enough existing meetings for accept/decline/cancel flow");
      }
    }, 2000);

    await safeStep("invitee accepts", async () => {
      await page.goto(`${baseUrl}${acceptMeeting.invitees[0].responseUrl}&response=ACCEPTED`, { waitUntil: "domcontentloaded" });
      await page.getByText(/accepted/i).first().waitFor({ state: "visible", timeout: 20000 });
    }, 5000);

    await safeStep("organizer sees accepted status", async () => {
      await page.goto(eventUrl, { waitUntil: "domcontentloaded" });
      const card = page.locator("div.rounded-lg.border.border-subtle.p-4").filter({ hasText: acceptMeeting.title }).first();
      await card.getByText(/ACCEPTED/i).first().waitFor({ state: "visible", timeout: 20000 });
    }, 4500);

    await safeStep("invitee declines", async () => {
      await page.goto(`${baseUrl}${declineMeeting.invitees[0].responseUrl}&response=DECLINED`, { waitUntil: "domcontentloaded" });
      await page.getByText(/declined/i).first().waitFor({ state: "visible", timeout: 20000 });
    }, 5000);

    await safeStep("organizer sees declined status", async () => {
      await page.goto(eventUrl, { waitUntil: "domcontentloaded" });
      const card = page.locator("div.rounded-lg.border.border-subtle.p-4").filter({ hasText: declineMeeting.title }).first();
      await card.getByText(/DECLINED/i).first().waitFor({ state: "visible", timeout: 20000 });
    }, 4500);

    await safeStep("open reschedule page", async () => {
      await page.goto(
        `${baseUrl}/reschedule/${acceptMeeting.booking.uid}?rescheduledBy=${encodeURIComponent(acceptMeeting.invitees[0].email)}`,
        { waitUntil: "domcontentloaded" }
      );
      await page.getByTestId("time").first().waitFor({ state: "visible", timeout: 30000 });
    }, 5000);

    await safeStep("select reschedule slot", async () => {
      await page.getByTestId("time").first().click();
      await page.getByRole("button", { name: /^Reschedule$/i }).waitFor({ state: "visible", timeout: 15000 });
    }, 3000);

    await safeStep("confirm reschedule", async () => {
      await page.getByRole("button", { name: /^Reschedule$/i }).click();
      await page.waitForURL(/slot=/, { timeout: 30000 });
      rescheduleCompleted = true;
    }, 6000);

    await safeStep("pause on completed reschedule", async () => {
      if (!rescheduleCompleted) throw new Error("Reschedule did not complete");
      await delay(5000);
    }, 5000);

    await safeStep("organizer cancels meeting", async () => {
      await page.goto(eventUrl, { waitUntil: "domcontentloaded" });
      const card = page.locator("div.rounded-lg.border.border-subtle.p-4").filter({ hasText: cancelMeeting.title }).first();
      await card.getByRole("button", { name: /^Cancel$/i }).click();
      await card.getByText(/CANCELLED/i).first().waitFor({ state: "visible", timeout: 20000 });
    }, 5000);

    await page.screenshot({ path: path.join(runDir, "final.png"), fullPage: true });
  } finally {
    captureActive = false;
    await captureLoop;

    const rawVideo = await page.video()?.path();
    await context.close();
    await browser.close();

    if (rawVideo) await fs.copyFile(rawVideo, finalVideo);

    await fs.writeFile(
      path.join(runDir, "result.json"),
      JSON.stringify({ attempt, errors, logs, finalVideo, rescheduleCompleted }, null, 2)
    );
  }

  return { errors, runDir };
}

let success = false;
let finalRun = null;
for (let attempt = 1; attempt <= 5; attempt++) {
  await fs.rm(runsRoot, { recursive: true, force: true });
  await fs.mkdir(runsRoot, { recursive: true });
  await fs.rm(finalVideo, { force: true });

  const result = await runAttempt(attempt);
  finalRun = result.runDir;
  if (result.errors.length === 0) {
    success = true;
    break;
  }
}

console.log(JSON.stringify({ success, finalRun, outputVideo: finalVideo }, null, 2));
if (!success) process.exitCode = 1;
