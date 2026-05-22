import playwrightPkg from "../.pi/extensions/desktop-tools/node_modules/playwright/index.js";
import path from "node:path";
import fs from "node:fs/promises";
const { chromium } = playwrightPkg;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const baseUrl = "http://localhost:3000";
await page.goto(`${baseUrl}/auth/login`, { waitUntil: "domcontentloaded" });

const email = page.locator('input[type="email"], input[name="email"]').first();
const pass = page.locator('input[type="password"], input[name="password"]').first();
if ((await email.count()) && (await pass.count())) {
  await email.fill("test-admin@local.dev");
  await pass.fill("TestAdmin12345!");
  const btn = page.getByRole("button", { name: /log in|sign in|continue/i }).first();
  if (await btn.count()) await btn.click();
  await page.waitForTimeout(1500);
}

await page.goto(`${baseUrl}/event-types`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1000);

const links = await page.locator('a[href*="/event-types/"]').evaluateAll((nodes) =>
  nodes.map((n) => ({ href: (n).href, text: n.textContent?.trim() || "" }))
);

const report = [];
for (let i = 0; i < links.length; i++) {
  const href = links[i].href;
  await page.goto(href, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  const bodyText = (await page.locator("body").innerText()).toLowerCase();
  const hasSpecific = bodyText.includes("specific meetings") || bodyText.includes("specific_meetings");
  report.push({ href, hasSpecific, title: await page.title() });
  await page.screenshot({ path: path.resolve(`artifacts/video-demo/event-type-${i + 1}.png`), fullPage: true });
}

await fs.writeFile(path.resolve("artifacts/video-demo/event-type-report.json"), JSON.stringify(report, null, 2));
console.log(report);
await browser.close();
