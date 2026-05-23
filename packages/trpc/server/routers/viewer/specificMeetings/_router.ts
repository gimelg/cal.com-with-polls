// biome-ignore-all lint/nursery/useExplicitType: Router types are inferred from the procedure builders.
import { sendSpecificMeetingCancelledEmail, sendSpecificMeetingInviteEmail } from "@calcom/emails/poll-email-service";
import { getHideBranding } from "@calcom/features/profile/lib/hideBranding";
import { SpecificMeetingService } from "@calcom/features/specific-meetings/services/SpecificMeetingService";
import { getTranslation } from "@calcom/i18n/server";
import { WEBAPP_URL } from "@calcom/lib/constants";
import { z } from "zod";
import authedProcedure from "../../../procedures/authedProcedure";
import { router } from "../../../trpc";

const participantSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().email(),
});

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

const getMeetingLink = (meetingUid: string, token: string) => {
  return new URL(`/meeting/${meetingUid}?token=${token}`, WEBAPP_URL).toString();
};

const getMeetingResponseLink = (meetingUid: string, token: string, response: "ACCEPTED" | "DECLINED") => {
  return new URL(`/meeting/${meetingUid}?token=${token}&response=${response}`, WEBAPP_URL).toString();
};

const getEmailContext = async (user: {
  id: number;
  name?: string | null;
  email: string;
  locale?: string | null;
  hideBranding?: boolean;
  organization?: { hideBranding?: boolean } | null;
}) => {
  const organizerName = user.name || user.email;
  const hideBranding = await shouldHideBrandingForOrganizer(user);
  const t = await getTranslation(user.locale || "en", "common");

  return { organizerName, hideBranding, t };
};

const getMeetingTime = (meeting: Awaited<ReturnType<SpecificMeetingService["getForOrganizer"]>>, locale?: string | null) => {
  return new Intl.DateTimeFormat(locale || "en", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: meeting.timeZone,
  }).format(new Date(meeting.startTime));
};

const sendInviteForMeetingInvitee = async ({
  meeting,
  invitee,
  user,
}: {
  meeting: Awaited<ReturnType<SpecificMeetingService["getForOrganizer"]>>;
  invitee: Awaited<ReturnType<SpecificMeetingService["getForOrganizer"]>>["invitees"][number];
  user: {
    id: number;
    name?: string | null;
    email: string;
    locale?: string | null;
    hideBranding?: boolean;
    organization?: { hideBranding?: boolean } | null;
  };
}) => {
  const { organizerName, hideBranding, t } = await getEmailContext(user);
  const meetingTime = getMeetingTime(meeting, user.locale);
  const meetingLink = getMeetingLink(meeting.uid, invitee.responseToken);

  await sendSpecificMeetingInviteEmail({
    to: invitee.email,
    organizerName,
    participantName: invitee.name,
    meetingTitle: meeting.title,
    meetingDescription: meeting.description,
    meetingTime,
    meetingLink,
    acceptLink: getMeetingResponseLink(meeting.uid, invitee.responseToken, "ACCEPTED"),
    declineLink: getMeetingResponseLink(meeting.uid, invitee.responseToken, "DECLINED"),
    hideBranding,
    t,
  });
};

const sendCancellationForMeetingInvitee = async ({
  meeting,
  invitee,
  user,
}: {
  meeting: Awaited<ReturnType<SpecificMeetingService["getForOrganizer"]>>;
  invitee: Awaited<ReturnType<SpecificMeetingService["getForOrganizer"]>>["invitees"][number];
  user: {
    id: number;
    name?: string | null;
    email: string;
    locale?: string | null;
    hideBranding?: boolean;
    organization?: { hideBranding?: boolean } | null;
  };
}) => {
  const { organizerName, hideBranding, t } = await getEmailContext(user);
  const meetingTime = getMeetingTime(meeting, user.locale);

  await sendSpecificMeetingCancelledEmail({
    to: invitee.email,
    organizerName,
    participantName: invitee.name,
    meetingTitle: meeting.title,
    meetingDescription: meeting.description,
    meetingTime,
    meetingLink: getMeetingLink(meeting.uid, invitee.responseToken),
    hideBranding,
    t,
  });
};

export const specificMeetingsRouter = router({
  listByEventType: authedProcedure
    .input(
      z.object({
        eventTypeId: z.number().int().positive(),
      })
    )
    .query(async ({ ctx, input }) => {
      const service = new SpecificMeetingService();
      return await service.listByEventType({
        eventTypeId: input.eventTypeId,
        organizerId: ctx.user.id,
      });
    }),
  create: authedProcedure
    .input(
      z.object({
        eventTypeId: z.number().int().positive(),
        title: z.string().trim().min(1),
        description: z.string().trim().nullish(),
        timeZone: z.string().trim().min(1),
        startTime: z.date(),
        endTime: z.date(),
        participants: z.array(participantSchema).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const service = new SpecificMeetingService();
      const meeting = await service.create({
        organizerId: ctx.user.id,
        eventTypeId: input.eventTypeId,
        title: input.title,
        description: input.description,
        timeZone: input.timeZone,
        startTime: input.startTime,
        endTime: input.endTime,
        participants: input.participants,
      });

      await Promise.allSettled(
        (meeting.invitees ?? []).map(async (invitee) => {
          await sendInviteForMeetingInvitee({
            meeting,
            invitee,
            user: ctx.user,
          });
        })
      );

      return meeting;
    }),
  get: authedProcedure
    .input(
      z.object({
        uid: z.string().min(1),
      })
    )
    .query(async ({ ctx, input }) => {
      const service = new SpecificMeetingService();
      return await service.getForOrganizer({
        uid: input.uid,
        organizerId: ctx.user.id,
      });
    }),
  cancel: authedProcedure
    .input(
      z.object({
        uid: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const service = new SpecificMeetingService();
      const meeting = await service.cancel({
        uid: input.uid,
        organizerId: ctx.user.id,
        organizerEmail: ctx.user.email,
        organizerUuid: ctx.user.uuid,
      });

      await Promise.allSettled(
        (meeting.invitees ?? []).map(async (invitee) => {
          await sendCancellationForMeetingInvitee({
            meeting,
            invitee,
            user: ctx.user,
          });
        })
      );

      return meeting;
    }),
  resendInvite: authedProcedure
    .input(
      z.object({
        uid: z.string().min(1),
        inviteeId: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const service = new SpecificMeetingService();
      const meeting = await service.getForOrganizer({
        uid: input.uid,
        organizerId: ctx.user.id,
      });
      const invitee = meeting.invitees.find((item) => item.id === input.inviteeId);

      if (!invitee) {
        throw new Error("Invitee not found");
      }

      await sendInviteForMeetingInvitee({
        meeting,
        invitee,
        user: ctx.user,
      });

      return { success: true };
    }),
});
