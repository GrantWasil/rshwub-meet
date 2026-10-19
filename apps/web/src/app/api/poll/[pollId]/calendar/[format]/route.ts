import type { CalendarEvent } from "calendar-link";
import { google, office365, outlook, yahoo } from "calendar-link";
import { getFinalizedPollCalendarData } from "@/features/poll/finalization/data";
import { getClientIp } from "@/lib/client-ip";
import { createRatelimit } from "@/lib/rate-limit";
import { createIcsEvent } from "@/lib/utils/ics";

const limiter = createRatelimit(60, "1 h");
const calendarLinks = { "google-calendar": google, office365, outlook, yahoo };

export async function GET(
  request: Request,
  { params }: { params: Promise<{ pollId: string; format: string }> },
) {
  const { pollId, format } = await params;
  if (format !== "ics" && !Object.hasOwn(calendarLinks, format))
    return new Response("Not found", { status: 404 });
  const ip = getClientIp(request.headers) ?? "unknown";
  if (limiter && !(await limiter.limit(`poll-calendar:${ip}`)).success)
    return new Response("Please try again later", { status: 429 });
  const event = await getFinalizedPollCalendarData(pollId);
  if (!event) return new Response("Event not found", { status: 404 });
  if (format === "ics") {
    const { error, value } = createIcsEvent({
      ...event,
      timeZone: event.timeZone ?? undefined,
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
  const calendarEvent: CalendarEvent = { ...event, busy: true };
  const createLink = calendarLinks[format as keyof typeof calendarLinks];
  return Response.redirect(createLink(calendarEvent), 302);
}
