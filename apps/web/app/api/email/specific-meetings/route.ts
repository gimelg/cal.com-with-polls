import renderEmail from "@calcom/emails/src/renderEmail";
import { getTranslation } from "@calcom/i18n/server";
import { IS_PRODUCTION } from "@calcom/lib/constants";
import { defaultResponderForAppDir } from "app/api/defaultResponderForAppDir";
import { type NextRequest, NextResponse } from "next/server";

async function getHandler(request: NextRequest) {
  if (IS_PRODUCTION) {
    return new NextResponse("Only for development purposes", { status: 403 });
  }

  const template = request.nextUrl.searchParams.get("template") || "invite";
  const hideBranding = request.nextUrl.searchParams.get("hideBranding") === "1";
  const t = await getTranslation("en", "common");
  const meetingTime = new Intl.DateTimeFormat("en", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date("2026-05-22T15:15:00.000Z"));

  const common = {
    t,
    organizerName: "Test Admin",
    participantName: "Clean Invitee",
    meetingTitle: "Clean flow meeting",
    meetingDescription: "Slow paced clean run",
    meetingTime,
    meetingLink: "http://localhost:3000/meeting/sm_demo?token=demo-token",
    hideBranding,
  };

  let emailHtml = "";

  if (template === "confirmation") {
    emailHtml = await renderEmail("SpecificMeetingConfirmationEmail", {
      ...common,
      cancelLink:
        "http://localhost:3000/booking/booking_demo?cancel=true&cancelledBy=clean-invitee%40local.dev",
      rescheduleLink: "http://localhost:3000/reschedule/booking_demo?rescheduledBy=clean-invitee%40local.dev",
      inviteeStatuses: [
        { name: "Clean Invitee", status: "ACCEPTED" },
        { name: "Second Invitee", status: "PENDING" },
        { name: "Third Invitee", status: "DECLINED" },
      ],
    });
  } else if (template === "cancelled") {
    emailHtml = await renderEmail("SpecificMeetingCancelledEmail", common);
  } else {
    emailHtml = await renderEmail("SpecificMeetingInviteEmail", {
      ...common,
      acceptLink: "http://localhost:3000/meeting/sm_demo?token=demo-token&response=ACCEPTED",
      declineLink: "http://localhost:3000/meeting/sm_demo?token=demo-token&response=DECLINED",
    });
  }

  const response = new NextResponse(emailHtml);
  response.headers.set("Content-Type", "text/html");
  response.headers.set("Cache-Control", "no-cache, no-store, private, must-revalidate");
  return response;
}

export const GET = defaultResponderForAppDir(getHandler);
