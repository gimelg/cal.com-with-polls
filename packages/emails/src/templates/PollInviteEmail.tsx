import { APP_NAME } from "@calcom/lib/constants";
import type { TFunction } from "i18next";
import { BaseEmailHtml, CallToAction } from "../components";

export type PollInviteEmailProps = {
  t: TFunction;
  organizerName: string;
  participantName: string;
  pollTitle: string;
  pollDescription?: string | null;
  pollLink: string;
  hideBranding: boolean;
};

export const PollInviteEmail = (
  props: PollInviteEmailProps & Partial<React.ComponentProps<typeof BaseEmailHtml>>
) => {
  const bodyKey = props.hideBranding ? "poll_invite_email_body_no_branding" : "poll_invite_email_body";

  return (
    <BaseEmailHtml subject={props.t("poll_invite_email_subject", { pollTitle: props.pollTitle })}>
      <p
        style={{
          fontWeight: 600,
          fontSize: "28px",
          lineHeight: "34px",
          marginBottom: "16px",
        }}>
        {props.t("poll_invite_email_heading")}
      </p>

      <p style={{ fontWeight: 400, lineHeight: "24px" }}>
        {props.t(bodyKey, {
          participantName: props.participantName,
          organizerName: props.organizerName,
          pollTitle: props.pollTitle,
          appName: APP_NAME,
        })}
      </p>

      {props.pollDescription ? (
        <p style={{ fontWeight: 400, lineHeight: "24px", marginTop: "12px" }}>{props.pollDescription}</p>
      ) : null}

      <hr style={{ marginTop: "24px", marginBottom: "24px" }} />

      <CallToAction label={props.t("poll_invite_email_cta")} href={props.pollLink} />

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
