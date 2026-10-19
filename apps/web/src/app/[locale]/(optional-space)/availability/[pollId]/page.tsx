import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RouterLoadingIndicator } from "@/components/router-loading-indicator";
import { AvailabilityPoll } from "@/features/poll/availability/components/availability-poll";
import { loadAvailabilityPoll } from "@/features/poll/availability/loaders";

export const metadata: Metadata = {
  title: "Availability poll",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

async function PollContent({
  params,
  searchParams,
}: {
  params: Promise<{ pollId: string }>;
  searchParams: Promise<{ responseToken?: string | string[] }>;
}) {
  const [{ pollId }, query] = await Promise.all([params, searchParams]);
  const responseToken =
    typeof query.responseToken === "string" ? query.responseToken : undefined;
  const poll = await loadAvailabilityPoll(pollId, responseToken);
  if (!poll) notFound();
  return <AvailabilityPoll poll={poll} responseToken={responseToken} />;
}

export default function Page(props: {
  params: Promise<{ pollId: string }>;
  searchParams: Promise<{ responseToken?: string | string[] }>;
}) {
  return (
    <Suspense fallback={<RouterLoadingIndicator />}>
      <PollContent {...props} />
    </Suspense>
  );
}
