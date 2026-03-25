import { APP_NAME, SUPPORT_MAIL_ADDRESS } from "@calcom/lib/constants";
import type { TFunction } from "i18next";
import { BaseEmailHtml, CallToAction } from "../components";

export type PollFinalizedEmailProps = {
  t: TFunction;
  recipientName: string;
  recipientRole: "ORGANIZER" | "PARTICIPANT";
  pollTitle: string;
  pollDescription?: string | null;
  selectedSlot: string;
  pollLink: string;
};

export const PollFinalizedEmail = (
  props: PollFinalizedEmailProps & Partial<React.ComponentProps<typeof BaseEmailHtml>>
) => {
  const bodyKey =
    props.recipientRole === "ORGANIZER"
      ? "poll_finalized_email_body_organizer"
      : "poll_finalized_email_body_participant";

  return (
    <BaseEmailHtml subject={props.t("poll_finalized_email_subject", { pollTitle: props.pollTitle })}>
      <p
        style={{
          fontWeight: 600,
          fontSize: "28px",
          lineHeight: "34px",
          marginBottom: "16px",
        }}>
        {props.t("poll_finalized_email_heading")}
      </p>

      <p style={{ fontWeight: 400, lineHeight: "24px" }}>
        {props.t(bodyKey, {
          recipientName: props.recipientName,
          pollTitle: props.pollTitle,
          appName: APP_NAME,
        })}
      </p>

      {props.pollDescription ? (
        <p style={{ fontWeight: 400, lineHeight: "24px", marginTop: "12px" }}>{props.pollDescription}</p>
      ) : null}

      <p style={{ fontWeight: 500, lineHeight: "24px", marginTop: "16px" }}>
        {props.t("poll_finalized_email_selected_slot", { slot: props.selectedSlot })}
      </p>

      <hr style={{ marginTop: "24px", marginBottom: "24px" }} />

      <CallToAction label={props.t("poll_finalized_email_cta")} href={props.pollLink} />

      <p style={{ fontWeight: 400, lineHeight: "24px", marginTop: "20px" }}>
        {props.t("poll_invite_email_fallback")}
      </p>
      <p style={{ fontWeight: 400, lineHeight: "24px", marginTop: "4px" }}>
        <a href={props.pollLink} style={{ color: "#3E3E3E" }} target="_blank" rel="noreferrer">
          {props.pollLink}
        </a>
      </p>

      <p style={{ fontWeight: 400, lineHeight: "24px", marginTop: "28px" }}>
        {props.t("poll_invite_email_footer", { supportEmail: SUPPORT_MAIL_ADDRESS })}
      </p>
    </BaseEmailHtml>
  );
};
