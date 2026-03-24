import type { PageProps } from "app/_types";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicPollPage } from "~/polls/components/PublicPollPage";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

const PollPage = async ({ params }: PageProps) => {
  const { uid } = await params;
  if (typeof uid !== "string") {
    notFound();
  }

  return <PublicPollPage uid={uid} />;
};

export default PollPage;
