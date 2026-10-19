import { getAvailabilityCalendarData } from "@/features/poll/availability/data";
import { createIcsEvent } from "@/lib/utils/ics";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ pollId: string }> },
) {
  const { pollId } = await params;
  const event = await getAvailabilityCalendarData(pollId);
  if (!event) return new Response("Event not found", { status: 404 });
  const { error, value } = createIcsEvent({
    ...event,
    allDay: false,
    method: "publish",
  });
  if (error || !value)
    return new Response("Unable to create calendar file", { status: 500 });
  return new Response(value, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="meetup.ics"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
