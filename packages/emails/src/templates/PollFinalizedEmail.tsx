import { APP_NAME } from "@calcom/lib/constants";
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
  hideBranding: boolean;
};

export const PollFinalizedEmail = (
  props: PollFinalizedEmailProps & Partial<React.ComponentProps<typeof BaseEmailHtml>>
): JSX.Element => {
  let bodyKey = "poll_finalized_email_body_participant";
  if (props.recipientRole === "ORGANIZER") {
    bodyKey = "poll_finalized_email_body_organizer";
  }

  if (props.hideBranding) {
    if (props.recipientRole === "ORGANIZER") {
      bodyKey = "poll_finalized_email_body_organizer_no_branding";
    } else {
      bodyKey = "poll_finalized_email_body_participant_no_branding";
    }
  }

  const showDescription = Boolean(props.pollDescription);

  return (
    <BaseEmailHtml
      subject={props.t("poll_finalized_email_subject", { pollTitle: props.pollTitle })}
      hideLogo={props.hideBranding}>
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

      {showDescription && (
        <p style={{ fontWeight: 400, lineHeight: "24px", marginTop: "12px" }}>{props.pollDescription}</p>
      )}

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
    </BaseEmailHtml>
  );
};
