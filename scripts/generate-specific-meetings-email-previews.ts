import fs from "node:fs/promises";
import path from "node:path";

import ReactDOMServer from "react-dom/server";
import { SpecificMeetingCancelledEmail } from "../packages/emails/src/templates/SpecificMeetingCancelledEmail.tsx";
import { SpecificMeetingConfirmationEmail } from "../packages/emails/src/templates/SpecificMeetingConfirmationEmail.tsx";
import { SpecificMeetingInviteEmail } from "../packages/emails/src/templates/SpecificMeetingInviteEmail.tsx";
import { getTranslation } from "../packages/i18n/server";

async function main() {
  const outDir = path.resolve("artifacts/specific-meetings-email-previews");
  await fs.mkdir(outDir, { recursive: true });

  const t = await getTranslation("en", "common");

  const common = {
    t,
    organizerName: "Test Admin",
    participantName: "Clean Invitee",
    meetingTitle: "Clean flow meeting",
    meetingDescription: "Slow paced clean run",
    meetingTime: "5/22/2026, 3:15:00 PM",
    meetingLink: "http://localhost:3000/meeting/sm_demo?token=demo-token",
    hideBranding: false,
  };

  const render = (element: Parameters<typeof ReactDOMServer.renderToStaticMarkup>[0]) =>
    ReactDOMServer.renderToStaticMarkup(element)
      .replace(/<script><\/script>/g, "")
      .replace(
        "<html>",
        `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">`
      );

  const inviteHtml = render(
    SpecificMeetingInviteEmail({
      ...common,
      acceptLink: "http://localhost:3000/meeting/sm_demo?token=demo-token&response=ACCEPTED",
      declineLink: "http://localhost:3000/meeting/sm_demo?token=demo-token&response=DECLINED",
    }) as never
  );

  const confirmationHtml = render(
    SpecificMeetingConfirmationEmail({
      ...common,
      cancelLink: "http://localhost:3000/booking/booking_demo?cancel=true&cancelledBy=clean-invitee%40local.dev",
      rescheduleLink: "http://localhost:3000/reschedule/booking_demo?rescheduledBy=clean-invitee%40local.dev",
    }) as never
  );

  const cancelledHtml = render(SpecificMeetingCancelledEmail(common) as never);

  await fs.writeFile(path.join(outDir, "invite.html"), inviteHtml);
  await fs.writeFile(path.join(outDir, "confirmation.html"), confirmationHtml);
  await fs.writeFile(path.join(outDir, "cancelled.html"), cancelledHtml);

  const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Specific Meetings Actual Email Output</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; padding: 24px; background: #111827; color: #f3f4f6; }
      h1, h2, p { margin-top: 0; }
      .card { background: #1f2937; border: 1px solid #374151; border-radius: 12px; padding: 16px; margin-bottom: 20px; }
      iframe { width: 100%; height: 900px; border: 1px solid #374151; border-radius: 12px; background: white; }
      a { color: #93c5fd; }
      .pill { display: inline-block; padding: 4px 8px; border-radius: 999px; background: #374151; margin-right: 8px; margin-bottom: 8px; font-size: 12px; }
    </style>
  </head>
  <body>
    <h1>Specific Meetings Actual Email Output</h1>
    <div class="card">
      <div class="pill">Actual rendered template output</div>
      <div class="pill">Invite: Yes / No buttons</div>
      <div class="pill">Confirmation: Cancel / Reschedule</div>
      <div class="pill">Cancellation email</div>
      <p>
        Files:
        <a href="specific-meetings-email-previews/invite.html">invite.html</a> ·
        <a href="specific-meetings-email-previews/confirmation.html">confirmation.html</a> ·
        <a href="specific-meetings-email-previews/cancelled.html">cancelled.html</a>
      </p>
    </div>
    <div class="card">
      <h2>Invite email</h2>
      <iframe src="specific-meetings-email-previews/invite.html"></iframe>
    </div>
    <div class="card">
      <h2>Confirmation email</h2>
      <iframe src="specific-meetings-email-previews/confirmation.html"></iframe>
    </div>
    <div class="card">
      <h2>Cancellation email</h2>
      <iframe src="specific-meetings-email-previews/cancelled.html"></iframe>
    </div>
  </body>
</html>`;

  await fs.writeFile(path.resolve("artifacts/specific-meetings-emails-actual.html"), indexHtml);
}

void main();
