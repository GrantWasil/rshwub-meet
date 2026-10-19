import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ data: vi.fn(), limit: vi.fn() }));
vi.mock("@/features/poll/finalization/data", () => ({
  getFinalizedPollCalendarData: mocks.data,
}));
vi.mock("@/lib/rate-limit", () => ({
  createRatelimit: () => ({ limit: mocks.limit }),
}));

import { GET } from "./route";

const event = {
  uid: "poll-option@meet.rshwub.com",
  title: "Games",
  timeZone: "America/Denver",
  allDay: false,
  start: new Date("2026-10-21T00:00:00Z"),
  end: new Date("2026-10-21T02:00:00Z"),
};
const request = new Request("http://localhost/api/poll/poll/calendar/ics");
const params = (format: string) => ({
  params: Promise.resolve({ pollId: "poll", format }),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.limit.mockResolvedValue({ success: true });
  mocks.data.mockResolvedValue(event);
});

it("exports timed guest events without inventing an organizer email", async () => {
  const response = await GET(request, params("ics"));
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toBe(
    "text/calendar; charset=utf-8",
  );
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  const body = await response.text();
  expect(body).toContain("DTSTART:20261021T000000Z");
  expect(body).toContain("DTEND:20261021T020000Z");
  expect(body).toContain("UID:poll-option@meet.rshwub.com");
  expect(body).not.toContain("ORGANIZER");
});

it("exports floating all-day dates without a viewer-zone shift", async () => {
  mocks.data.mockResolvedValue({
    ...event,
    allDay: true,
    timeZone: null,
    start: new Date("2026-10-20T00:00:00Z"),
    end: new Date("2026-10-21T00:00:00Z"),
  });
  const response = await GET(request, params("ics"));
  const body = await response.text();
  expect(body).toContain("DTSTART;VALUE=DATE:20261020");
  expect(body).toContain("DTEND;VALUE=DATE:20261021");
});

it.each([
  ["google-calendar", "calendar.google.com"],
  ["office365", "outlook.office.com"],
  ["outlook", "outlook.live.com"],
  ["yahoo", "calendar.yahoo.com"],
])("supports the %s calendar destination", async (format, hostname) => {
  const response = await GET(request, params(format));
  expect(response.status).toBe(302);
  expect(new URL(response.headers.get("location") as string).hostname).toBe(
    hostname,
  );
});

it("cannot export a reopened or deleted poll and rejects unknown formats", async () => {
  mocks.data.mockResolvedValue(null);
  expect((await GET(request, params("ics"))).status).toBe(404);
  expect((await GET(request, params("toString"))).status).toBe(404);
});

it("bounds calendar downloads before loading poll data", async () => {
  mocks.limit.mockResolvedValue({ success: false });
  expect((await GET(request, params("ics"))).status).toBe(429);
  expect(mocks.data).not.toHaveBeenCalled();
});
