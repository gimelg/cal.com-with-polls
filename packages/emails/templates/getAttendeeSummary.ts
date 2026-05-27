import type { CalendarEvent } from "@calcom/types/Calendar";

export const getAttendeeSummary = (calEvent: CalendarEvent): string => {
  const [firstAttendee, ...otherAttendees] = calEvent.attendees;

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

export const getCompactEventTitle = (calEvent: CalendarEvent): string => {
  const attendeeSummary = getAttendeeSummary(calEvent);

  if (!attendeeSummary || !calEvent.type || calEvent.title === calEvent.type) {
    return calEvent.title;
  }

  return `${calEvent.type} with ${attendeeSummary}`;
};
