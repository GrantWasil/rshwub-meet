import type { Metadata } from "next";
import { CreateAvailabilityPoll } from "@/features/poll/availability/components/create-availability-poll";

export const metadata: Metadata = { title: "New availability poll" };

export default function Page() {
  return <CreateAvailabilityPoll />;
}
