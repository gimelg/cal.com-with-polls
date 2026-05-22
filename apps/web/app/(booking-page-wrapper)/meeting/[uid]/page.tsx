import type { PageProps } from "app/_types";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicSpecificMeetingPage } from "~/specific-meetings/components/PublicSpecificMeetingPage";

const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

const MeetingPage = async ({ params, searchParams }: PageProps): Promise<JSX.Element> => {
  const { uid } = await params;
  const resolvedSearchParams = await searchParams;

  if (typeof uid !== "string") {
    notFound();
  }

  let token = "";
  if (typeof resolvedSearchParams.token === "string") {
    token = resolvedSearchParams.token;
  }
  if (!token) {
    notFound();
  }

  const response =
    resolvedSearchParams.response === "ACCEPTED" || resolvedSearchParams.response === "DECLINED"
      ? resolvedSearchParams.response
      : undefined;

  return <PublicSpecificMeetingPage uid={uid} token={token} response={response} />;
};

export { metadata };
export default MeetingPage;
