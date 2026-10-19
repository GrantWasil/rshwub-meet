import type { Metadata } from "next";
import { Suspense } from "react";
import { RedeemManagementLink } from "@/features/poll/management/components/redeem-management-link";

export const metadata: Metadata = {
  title: "Manage poll",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

async function ManagementPage({
  params,
}: {
  params: Promise<{ pollId: string }>;
}) {
  const { pollId } = await params;
  return <RedeemManagementLink pollId={pollId} />;
}

export default function Page(props: { params: Promise<{ pollId: string }> }) {
  return (
    <Suspense>
      <ManagementPage {...props} />
    </Suspense>
  );
}
