# Screenshot capture notes for future sessions

The browser toolset in this harness does **not** expose a dedicated screenshot function.

## Working approach

Use `bash` with a small Playwright script and point it at the locally installed Chrome binary:

- Chrome binary:
  - `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- Screenshot API:
  - `page.screenshot({ path, fullPage: true })`

## Why this is needed

- `desktop_*` tools support browser open/click/type/wait/video
- they do **not** provide direct screenshot capture
- macOS `screencapture` failed in this environment (`could not create image from display`)
- bundled Playwright browser was not installed, so using the system Chrome executable works

## Example

```bash
node - <<'NODE'
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.screenshot({
    path: 'artifacts/screenshots/example.png',
    fullPage: true,
  });

  await browser.close();
})();
NODE
```

## Review HTML creation notes

When creating a reviewable HTML report for future sessions:

- prefer a slide-like layout with clear sections
- embed videos with a relative path, for example:
  - `<video controls><source src="../videos/example.webm" type="video/webm" /></video>`
- embed screenshots with relative paths, for example:
  - `<img src="../screenshots/example.png" alt="Verification screenshot" />`
- also list the full absolute file paths below each embedded asset so reviewers can open them directly
- include a short summary slide, an evidence slide, and a targeted-tests slide
- if the verification is an interaction flow, capture:
  - before state
  - action visible
  - after-click result
  - final URL / final state screenshot
- store raw artifacts under:
  - `artifacts/videos/`
  - `artifacts/screenshots/`
  - `artifacts/test-results/`
  - `artifacts/reports/`

## Recording interaction videos with Playwright

If `desktop_*` video output is too static, use Playwright from `bash` instead:

- launch Chrome with `executablePath`
- create a browser context with `recordVideo.dir`
- slow the interaction down with `waitForTimeout(...)`
- move the mouse before clicks so the video is easier to review
- close the context to flush the video file to disk

## Verified output

A successful test screenshot was created at:

- `/Users/gershon/Desktop/playground/cal.com-with-polls/artifacts/screenshots/test-playwright.png`
