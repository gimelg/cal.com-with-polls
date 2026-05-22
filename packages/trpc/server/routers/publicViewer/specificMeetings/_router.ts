// biome-ignore-all lint/nursery/useExplicitType: Router types are inferred from the procedure builders.
import { sendSpecificMeetingConfirmationEmail } from "@calcom/emails/poll-email-service";
import { getHideBranding } from "@calcom/features/profile/lib/hideBranding";
import { SpecificMeetingService } from "@calcom/features/specific-meetings/services/SpecificMeetingService";
import { getTranslation } from "@calcom/i18n/server";
import { WEBAPP_URL } from "@calcom/lib/constants";
import { z } from "zod";
import publicProcedure from "../../../procedures/publicProcedure";
import { router } from "../../../trpc";

const getMeetingLink = (meetingUid: string, token: string) => {
  return new URL(`/meeting/${meetingUid}?token=${token}`, WEBAPP_URL).toString();
};

const getBookingCancelLink = (bookingUid: string, attendeeEmail: string) => {
  return new URL(`/booking/${bookingUid}?cancel=true&cancelledBy=${encodeURIComponent(attendeeEmail)}`, WEBAPP_URL)
    .toString();
};

const getBookingRescheduleLink = (bookingUid: string, attendeeEmail: string) => {
  return new URL(`/reschedule/${bookingUid}?rescheduledBy=${encodeURIComponent(attendeeEmail)}`, WEBAPP_URL)
    .toString();
};

const shouldHideBrandingForOrganizer = async (user: {
  id: number;
  hideBranding?: boolean;
  organization?: { hideBranding?: boolean } | null;
}) => {
  try {
    return await getHideBranding({ userId: user.id });
  } catch {
    return Boolean(user.hideBranding || user.organization?.hideBranding);
  }
};

export const publicSpecificMeetingsRouter = router({
  getByUid: publicProcedure
    .input(
      z.object({
        uid: z.string().min(1),
        token: z.string().min(1),
      })
    )
    .query(async ({ input }) => {
      const service = new SpecificMeetingService();
      return await service.getInviteeView({
        uid: input.uid,
        responseToken: input.token,
      });
    }),
  respond: publicProcedure
    .input(
      z.object({
        uid: z.string().min(1),
        token: z.string().min(1),
        response: z.enum(["ACCEPTED", "DECLINED"]),
      })
    )
    .mutation(async ({ input }) => {
      const service = new SpecificMeetingService();
      const response = await service.respond({
        uid: input.uid,
        responseToken: input.token,
        response: input.response,
      });

      if (input.response === "ACCEPTED") {
        const bookingUid = response.booking?.uid;
        const organizerName = response.organizer.name || response.organizer.email || "Organizer";
        const hideBranding = await shouldHideBrandingForOrganizer(response.organizer);
        const t = await getTranslation("en", "common");
        const meetingTime = new Intl.DateTimeFormat("en", {
          dateStyle: "long",
          timeStyle: "short",
          timeZone: response.timeZone,
        }).format(new Date(response.startTime));

        if (bookingUid) {
          await sendSpecificMeetingConfirmationEmail({
            to: response.invitee.email,
            organizerName,
            participantName: response.invitee.name,
            meetingTitle: response.title,
            meetingDescription: response.description,
            meetingTime,
            meetingLink: getMeetingLink(response.uid, input.token),
            cancelLink: getBookingCancelLink(bookingUid, response.invitee.email),
            rescheduleLink: getBookingRescheduleLink(bookingUid, response.invitee.email),
            hideBranding,
            t,
          });
        }
      }

      return response;
    }),
});
