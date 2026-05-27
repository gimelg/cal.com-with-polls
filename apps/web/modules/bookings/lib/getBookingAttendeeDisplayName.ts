import type { BookingAttendee } from "../types";

const getTrimmedValue = (value: string | null | undefined) => {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : null;
};

export const getBookingAttendeeDisplayName = (attendee: Pick<BookingAttendee, "email" | "name" | "user">) => {
  return (
    getTrimmedValue(attendee.name) ??
    getTrimmedValue(attendee.user?.name) ??
    getTrimmedValue(attendee.user?.email) ??
    attendee.email
  );
};

export const hasBookingAttendeeDisplayName = (attendee: Pick<BookingAttendee, "name" | "user">) => {
  return Boolean(getTrimmedValue(attendee.name) ?? getTrimmedValue(attendee.user?.name));
};
