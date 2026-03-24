import type { PageProps } from "app/_types";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicPollPage } from "~/polls/components/PublicPollPage";

const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

const PollPage = async ({ params, searchParams }: PageProps) => {
  const { uid } = await params;
  const resolvedSearchParams = await searchParams;
  if (typeof uid !== "string") {
    notFound();
  }

  const prefilledName = typeof resolvedSearchParams.name === "string" ? resolvedSearchParams.name : "";
  const prefilledEmail = typeof resolvedSearchParams.email === "string" ? resolvedSearchParams.email : "";

  return <PublicPollPage uid={uid} prefilledName={prefilledName} prefilledEmail={prefilledEmail} />;
};

export { metadata };
export default PollPage;
