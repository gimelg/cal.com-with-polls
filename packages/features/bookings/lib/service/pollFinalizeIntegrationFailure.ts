import type { EventResult } from "@calcom/types/EventManager";

type PollFinalizeIntegrationFailure = {
  failedIntegrations: string[];
  userMessage: string;
};

const POLL_ID_METADATA_KEY = "pollId";
const POLL_OPTION_ID_METADATA_KEY = "pollOptionId";

const isRelevantResultType = (type: string) => {
  return type.includes("_video") || type.includes("_calendar") || type === "conferencing";
};

const getIntegrationName = (result: EventResult<unknown>) => {
  const appName = result.appName?.trim();
  if (appName) {
    return appName;
  }
  return result.type;
};

const buildUserMessage = (failedIntegrations: string[]) => {
  if (failedIntegrations.length === 1) {
    const [integration] = failedIntegrations;
    return `Poll finalization failed because ${integration} could not create the meeting. Reconnect ${integration} and try finalizing again.`;
  }

  return `Poll finalization failed because these integrations could not create the meeting: ${failedIntegrations.join(
    ", "
  )}. Reconnect those integrations and try finalizing again.`;
};

const isPollFinalizeMetadata = (metadata: Record<string, unknown> | null | undefined) => {
  if (!metadata) {
    return false;
  }

  const pollId = metadata[POLL_ID_METADATA_KEY];
  const pollOptionId = metadata[POLL_OPTION_ID_METADATA_KEY];

  return (
    typeof pollId === "string" &&
    pollId.length > 0 &&
    typeof pollOptionId === "string" &&
    pollOptionId.length > 0
  );
};

export const getPollFinalizeIntegrationFailure = ({
  metadata,
  results,
}: {
  metadata: Record<string, unknown> | null | undefined;
  results: EventResult<unknown>[];
}): PollFinalizeIntegrationFailure | null => {
  if (!isPollFinalizeMetadata(metadata)) {
    return null;
  }

  const failedIntegrations = Array.from(
    new Set(
      results.filter((result) => !result.success && isRelevantResultType(result.type)).map(getIntegrationName)
    )
  );

  if (failedIntegrations.length === 0) {
    return null;
  }

  return {
    failedIntegrations,
    userMessage: buildUserMessage(failedIntegrations),
  };
};
