import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@/test/test-utils";
import type { AvailabilityPoll as PollData } from "../types";
import { getAvailabilitySlots } from "../utils";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  browserTimeZone: vi.fn(() => "Australia/Sydney"),
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("i18next-icu", async () => {
  const { createRequire } = await import("node:module");
  const module = createRequire(import.meta.url)("i18next-icu");
  return { default: module.default ?? module };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.push,
    refresh: mocks.refresh,
    replace: mocks.replace,
  }),
}));
vi.mock("@/features/user/client", () => ({
  useUser: () => ({
    user: { id: "guest", isGuest: true, timeZone: "America/Denver" },
    createGuestIfNeeded: async () => {},
  }),
}));
vi.mock("@/features/user/components/user-dropdown", () => ({
  UserDropdown: () => null,
}));
vi.mock("@/features/poll/management/components/poll-management-link", () => ({
  PollManagementLink: () => null,
}));
vi.mock("@/features/poll/availability/components/availability-manage", () => ({
  AvailabilityManage: () => null,
}));
vi.mock(
  "@/features/poll/availability/components/availability-comments",
  () => ({ AvailabilityComments: () => null }),
);
vi.mock("@/features/poll/availability/actions", () => ({
  createAvailabilityPollAction: mocks.create,
  finalizeAvailabilityPollAction: vi.fn(),
  saveAvailabilityResponseAction: vi.fn(),
}));
vi.mock("@/lib/locale/client", () => ({
  useLocale: () => ({ locale: "en-US" }),
}));
vi.mock("@/lib/utils/date-time-utils", () => ({
  getBrowserTimeZone: mocks.browserTimeZone,
}));
vi.mock("@/components/time-zone-picker/time-zone-select", () => ({
  TimeZoneSelect: ({
    id,
    value,
    onValueChange,
  }: {
    id: string;
    value: string;
    onValueChange: (value: string) => void;
  }) => (
    <select
      id={id}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      <option value="America/Denver">America/Denver</option>
      <option value="Australia/Sydney">Australia/Sydney</option>
    </select>
  ),
}));
vi.mock("@rallly/ui/calendar", () => ({
  Calendar: ({ onSelect }: { onSelect: (value: Date[]) => void }) => (
    <button
      type="button"
      onClick={() => onSelect([new Date("2026-12-21T12:00:00")])}
    >
      Select December 21
    </button>
  ),
}));

import { AvailabilityPoll } from "./availability-poll";
import { AvailabilityResults } from "./availability-results";
import { CreateAvailabilityPoll } from "./create-availability-poll";

const config = {
  mode: "weekly" as const,
  dates: [],
  timeZone: "America/Denver",
  startMinute: 17 * 60,
  endMinute: 19 * 60,
  slotMinutes: 30 as const,
  durationMinutes: 60,
};
const slots = getAvailabilitySlots(config);
const poll: PollData = {
  id: "weekly-test",
  title: "Weekly game night",
  description: null,
  location: null,
  status: "open",
  config,
  participants: [
    {
      id: "one",
      name: "Alex",
      intervals: [{ start: slots[4].start, end: slots[5].end, type: "yes" }],
    },
    {
      id: "two",
      name: "Sam",
      intervals: [
        { start: slots[4].start, end: slots[5].end, type: "yes" },
        { start: slots[0].start, end: slots[1].end, type: "yes" },
      ],
    },
  ],
  currentParticipant: null,
  canManage: true,
  finalized: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue({ data: { pollId: "created" } });
});

describe("weekly availability", () => {
  it("defaults creation to all seven weekdays and submits without calendar dates", async () => {
    const user = userEvent.setup();
    render(<CreateAvailabilityPoll />);

    expect(screen.getByRole("radio", { name: "Typical week" })).toBeChecked();
    expect(screen.getByText("Monday–Sunday")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Select December 21" }),
    ).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Title"), "Weekly game night");
    await user.click(screen.getByRole("button", { name: "Create poll" }));

    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            mode: "weekly",
            dates: [],
            slotMinutes: 30,
            timeZone: "America/Denver",
          }),
        }),
      ),
    );
    expect(mocks.push).toHaveBeenCalledWith("/availability/created");
  });

  it("keeps specific-date creation optional and discards its dates when switching back to weekly", async () => {
    const user = userEvent.setup();
    render(<CreateAvailabilityPoll />);
    await user.click(screen.getByRole("radio", { name: "Specific dates" }));
    expect(screen.getByRole("button", { name: "Create poll" })).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "Select December 21" }),
    );
    await user.type(screen.getByLabelText("Title"), "One-time game night");
    await user.click(screen.getByRole("button", { name: "Create poll" }));
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            mode: "dates",
            dates: ["2026-12-21"],
          }),
        }),
      ),
    );

    mocks.create.mockClear();
    await user.click(screen.getByRole("radio", { name: "Typical week" }));
    await user.click(screen.getByRole("button", { name: "Create poll" }));
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({ mode: "weekly", dates: [] }),
        }),
      ),
    );
  });

  it("ranks recurring windows of the chosen duration without dates or finalization", () => {
    const { container } = render(
      <AvailabilityResults
        poll={poll}
        slots={slots}
        timeZone={config.timeZone}
        locale="en-US"
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Best weekly times" }),
    ).toBeVisible();
    const rows = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Tuesday, 5:00 PM – 6:00 PM");
    expect(rows[0]).toHaveTextContent("2 yes");
    expect(rows[1]).toHaveTextContent("Monday, 5:00 PM – 6:00 PM");
    expect(container.textContent).not.toMatch(/January|2026|Jan 5/);
    expect(
      screen.queryByRole("button", { name: "Choose this time" }),
    ).not.toBeInTheDocument();
  });

  it("uses one event timezone for a weekly poll and offers no dated calendar export", () => {
    const { container } = render(
      <AvailabilityPoll
        poll={{
          ...poll,
          status: "closed",
          finalized: { start: slots[0].start, end: slots[1].end },
        }}
      />,
    );
    expect(screen.getByText("All times in America/Denver")).toBeVisible();
    expect(screen.queryByLabelText("Show times in")).not.toBeInTheDocument();
    expect(mocks.browserTimeZone).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("link", { name: "Download calendar event" }),
    ).not.toBeInTheDocument();
    expect(container.querySelector('[data-time-row="0"]')).toHaveTextContent(
      "5:00 PM",
    );
    expect(container.textContent).not.toMatch(/January|2026|Jan 5/);
  });
});
