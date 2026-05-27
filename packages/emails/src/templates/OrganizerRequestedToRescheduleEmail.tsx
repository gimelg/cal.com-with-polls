import { OrganizerScheduledEmail } from "./OrganizerScheduledEmail";

const getAttendeeSummary = (props: React.ComponentProps<typeof OrganizerScheduledEmail>) => {
  const [firstAttendee, ...otherAttendees] = props.calEvent.attendees;

  if (!firstAttendee) {
    return "";
  }

  if (otherAttendees.length === 0) {
    return firstAttendee.name;
  }

  if (otherAttendees.length === 1) {
    return `${firstAttendee.name} and ${otherAttendees[0].name}`;
  }

  return `${firstAttendee.name} and ${otherAttendees.length} other attendees`;
};

export const OrganizerRequestedToRescheduleEmail = (
  props: React.ComponentProps<typeof OrganizerScheduledEmail>
) => {
  const attendeeSummary = getAttendeeSummary(props);

  return (
    <OrganizerScheduledEmail
      title={props.calEvent.organizer.language.translate("request_reschedule_title_organizer", {
        attendee: attendeeSummary,
        interpolation: { escapeValue: false },
      })}
      subtitle={
        <>
          {props.calEvent.organizer.language.translate("request_reschedule_subtitle_organizer", {
            attendee: attendeeSummary,
            interpolation: { escapeValue: false },
          })}
        </>
      }
      headerType="calendarCircle"
      subject="rescheduled_event_type_subject"
      callToAction={null}
      {...props}
    />
  );
};
