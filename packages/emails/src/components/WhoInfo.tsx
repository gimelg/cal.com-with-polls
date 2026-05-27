import isSmsCalEmail from "@calcom/lib/isSmsCalEmail";
import type { CalendarEvent } from "@calcom/types/Calendar";
import type { TFunction } from "i18next";
import { Info } from "./Info";

export const PersonInfo = ({ name = "", email = "", role = "", phoneNumber = "" }) => {
  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  const trimmedPhoneNumber = phoneNumber.trim();
  const displayEmail = Boolean(trimmedEmail) && !isSmsCalEmail(trimmedEmail);
  const displayName = trimmedName || trimmedEmail || trimmedPhoneNumber;
  const details = [role, trimmedPhoneNumber].filter(Boolean).join(" ");

  return (
    <div style={{ color: "#101010", fontWeight: 400, lineHeight: "24px" }}>
      {displayName}
      {details ? ` - ${details} ` : " "}
      {displayEmail && (
        <span style={{ color: "#4B5563" }}>
          <a href={`mailto:${trimmedEmail}`} style={{ color: "#4B5563" }}>
            {trimmedEmail}
          </a>
        </span>
      )}
    </div>
  );
};

export function WhoInfo(props: {
  calEvent: CalendarEvent;
  t: TFunction;
  showPollParticipantSummary?: boolean;
}) {
  const { t } = props;
  const shouldShowPollParticipantSummary =
    props.showPollParticipantSummary && typeof props.calEvent.pollUid === "string";

  const inviteOnlyParticipantNames = props.calEvent.attendees
    .map((attendee) => attendee.name.trim())
    .filter((attendeeName) => attendeeName.length > 0 && attendeeName !== "Poll participants");

  const pollParticipantSummary =
    inviteOnlyParticipantNames.length > 0 ? inviteOnlyParticipantNames.join(", ") : t("poll_participants");

  return (
    <Info
      label={t("who")}
      description={
        <>
          <PersonInfo
            name={props.calEvent.organizer.name}
            role={t("organizer")}
            email={props.calEvent.hideOrganizerEmail ? "" : props.calEvent.organizer.email}
          />
          {props.calEvent.team?.members.map((member) => (
            <PersonInfo
              key={member.name}
              name={member.name}
              role={t("team_member")}
              email={props.calEvent.hideOrganizerEmail ? "" : member?.email}
            />
          ))}
          {shouldShowPollParticipantSummary ? (
            <PersonInfo name={pollParticipantSummary} role={t("guest")} />
          ) : (
            props.calEvent.attendees.map((attendee) => (
              <PersonInfo
                key={attendee.id || attendee.name}
                name={attendee.name}
                role={t("guest")}
                email={attendee.email}
                phoneNumber={attendee.phoneNumber ?? undefined}
              />
            ))
          )}
        </>
      }
      withSpacer
    />
  );
}
