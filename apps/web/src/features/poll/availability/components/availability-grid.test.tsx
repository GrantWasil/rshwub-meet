import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@/test/test-utils";
import { getAvailabilitySlots } from "../utils";
import type { GridVote } from "./availability-grid";
import { AvailabilityGrid } from "./availability-grid";

// Use the real CommonJS ICU plugin: Vite's ESM interop otherwise resolves its
// IntlMessageFormat dependency as a namespace instead of a constructor.
vi.mock("i18next-icu", async () => {
  const { createRequire } = await import("node:module");
  const module = createRequire(import.meta.url)("i18next-icu");
  return { default: module.default ?? module };
});

const slots = ["2026-10-20", "2026-10-21"].flatMap((date) =>
  [0, 15].map((minute) => ({
    start: `${date}T18:${String(minute).padStart(2, "0")}:00.000Z`,
    end: `${date}T18:${String(minute + 15).padStart(2, "0")}:00.000Z`,
    date,
  })),
);

const weeklySlots = getAvailabilitySlots({
  mode: "weekly",
  dates: [],
  timeZone: "America/Denver",
  startMinute: 17 * 60,
  endMinute: 18 * 60,
  slotMinutes: 30,
  durationMinutes: 60,
});

function mockMobileViewport(initialMatches = false) {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      get matches() {
        return matches;
      },
      media: query,
      onchange: null,
      addEventListener: (
        _type: string,
        listener: (event: MediaQueryListEvent) => void,
      ) => listeners.add(listener),
      removeEventListener: (
        _type: string,
        listener: (event: MediaQueryListEvent) => void,
      ) => listeners.delete(listener),
    })),
  );
  return (nextMatches: boolean) => {
    matches = nextMatches;
    act(() => {
      for (const listener of listeners) {
        listener({ matches } as MediaQueryListEvent);
      }
    });
  };
}

function touchTap(target: HTMLElement, pointerId = 1) {
  fireEvent.pointerDown(target, {
    pointerType: "touch",
    pointerId,
    button: 0,
  });
  fireEvent.pointerUp(target, { pointerType: "touch", pointerId });
  fireEvent.click(target, { detail: 1 });
}

function EditableGrid({
  brush = "yes",
  initialValues = {},
  weekly = false,
}: {
  brush?: GridVote;
  initialValues?: Record<string, GridVote>;
  weekly?: boolean;
}) {
  const [values, setValues] =
    React.useState<Record<string, GridVote>>(initialValues);
  return (
    <AvailabilityGrid
      slots={weekly ? weeklySlots : slots}
      values={values}
      brush={brush}
      onChange={setValues}
      timeZone={weekly ? "America/Denver" : "UTC"}
      locale="en-US"
      weekly={weekly}
    />
  );
}

beforeEach(() => mockMobileViewport());

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("availability grid interaction", () => {
  it("shows a typical Monday–Sunday week without exposing internal dates", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AvailabilityGrid
        slots={weeklySlots}
        timeZone="America/Denver"
        locale="en-US"
        weekly
      />,
    );

    for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
      expect(screen.getByText(day, { exact: true })).toBeVisible();
    }
    const first = container.querySelector<HTMLButtonElement>(
      '[data-column="0"][data-row="0"]',
    );
    expect(first).toHaveAccessibleName(/Monday, 5:00 PM – 5:30 PM/);
    expect(first).not.toHaveTextContent("5:00 PM");
    expect(screen.getByText("5:00 PM", { exact: true })).toBeVisible();
    expect(screen.queryByText("5:30 PM", { exact: true })).toBeNull();
    expect(screen.getByText("6:00 PM", { exact: true })).toBeVisible();
    await user.tab();
    expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent(
      "Monday, 5:00 PM – 5:30 PM",
    );
    expect(container.textContent).not.toMatch(/January|2026|Jan 5/);
    for (const cell of container.querySelectorAll("[data-column]")) {
      expect(cell.getAttribute("aria-label")).not.toMatch(/January|2026|Jan 5/);
    }
  });

  it("lets a keyboard user navigate and mark an individual time", async () => {
    const user = userEvent.setup();
    const { container } = render(<EditableGrid />);
    const first = container.querySelector<HTMLButtonElement>(
      '[data-column="0"][data-row="0"]',
    );
    first?.focus();
    await user.keyboard("{ArrowRight}{ArrowDown} ");
    expect(
      container.querySelector('[data-column="1"][data-row="1"]'),
    ).toHaveAttribute("aria-pressed", "true");
    expect(first).toHaveAttribute("aria-pressed", "false");
  });

  it("paints a rectangle across days during a desktop drag", () => {
    const { container } = render(<EditableGrid />);
    const first = container.querySelector<HTMLButtonElement>(
      '[data-column="0"][data-row="0"]',
    );
    const last = container.querySelector<HTMLButtonElement>(
      '[data-column="1"][data-row="1"]',
    );
    if (!first || !last) throw new Error("Missing grid cells");
    const viewport = container.querySelector<HTMLDivElement>(".overflow-auto");
    if (!viewport) throw new Error("Missing grid viewport");
    viewport.setPointerCapture = vi.fn();
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => last),
    });
    fireEvent.pointerDown(first, {
      pointerType: "mouse",
      button: 0,
      pointerId: 1,
    });
    fireEvent.pointerMove(viewport, {
      pointerType: "mouse",
      pointerId: 1,
      clientX: 30,
      clientY: 40,
    });
    fireEvent.pointerUp(viewport, { pointerId: 1 });
    for (const cell of container.querySelectorAll("[data-column]"))
      expect(cell).toHaveAttribute("aria-pressed", "true");
  });

  it.each([
    "mouse",
    "touch",
  ])("paints the final %s drag position when no pointermove is delivered", async (pointerType) => {
    const mobile = pointerType === "touch";
    mockMobileViewport(mobile);
    const user = userEvent.setup();
    const onChange = vi.fn();
    const longWeek = getAvailabilitySlots({
      mode: "weekly",
      dates: [],
      timeZone: "America/Denver",
      startMinute: 17 * 60,
      endMinute: 19 * 60,
      slotMinutes: 30,
      durationMinutes: 60,
    });
    const testSlots = mobile ? longWeek : slots;
    const { container } = render(
      <AvailabilityGrid
        slots={testSlots}
        onChange={onChange}
        timeZone={mobile ? "America/Denver" : "UTC"}
        locale="en-US"
        weekly={mobile}
      />,
    );
    if (mobile) {
      await user.click(screen.getByRole("button", { name: "Edit Monday" }));
      await user.click(screen.getByRole("button", { name: "Paint" }));
    }
    const first = container.querySelector<HTMLButtonElement>(
      '[data-column="0"][data-row="0"]',
    );
    const last = container.querySelector<HTMLButtonElement>(
      mobile
        ? '[data-column="0"][data-row="3"]'
        : '[data-column="1"][data-row="1"]',
    );
    const viewport = container.querySelector<HTMLDivElement>(".overflow-auto");
    if (!first || !last || !viewport) throw new Error("Missing grid");
    viewport.setPointerCapture = vi.fn();
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => last),
    });

    fireEvent.pointerDown(first, { pointerType, button: 0, pointerId: 1 });
    fireEvent.pointerUp(viewport, {
      pointerType,
      pointerId: 1,
      clientX: 30,
      clientY: 40,
    });

    expect(onChange).toHaveBeenLastCalledWith(
      Object.fromEntries(
        (mobile ? testSlots.slice(0, 4) : testSlots).map((slot) => [
          slot.start,
          "yes",
        ]),
      ),
    );
  });

  it.each([
    "pointerCancel",
    "lostPointerCapture",
  ] as const)("does not paint a final drag position after %s", (endGesture) => {
    const onChange = vi.fn();
    const { container } = render(
      <AvailabilityGrid
        slots={slots}
        onChange={onChange}
        timeZone="UTC"
        locale="en-US"
      />,
    );
    const first = container.querySelector<HTMLButtonElement>(
      '[data-column="0"][data-row="0"]',
    );
    const last = container.querySelector<HTMLButtonElement>(
      '[data-column="1"][data-row="1"]',
    );
    const viewport = container.querySelector<HTMLDivElement>(".overflow-auto");
    if (!first || !last || !viewport) throw new Error("Missing grid");
    viewport.setPointerCapture = vi.fn();
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => last),
    });

    fireEvent.pointerDown(first, {
      pointerType: "mouse",
      button: 0,
      pointerId: 1,
    });
    fireEvent[endGesture](viewport, {
      pointerType: "mouse",
      pointerId: 1,
      clientX: 30,
      clientY: 40,
    });

    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      [slots[0].start]: "yes",
    });
  });

  it("skips missing daylight-saving times when navigating the shared rows", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const dstSlots = getAvailabilitySlots({
      dates: ["2026-03-07", "2026-03-08"],
      timeZone: "America/Denver",
      startMinute: 60,
      endMinute: 4 * 60,
      slotMinutes: 30,
      durationMinutes: 60,
    });
    const { container } = render(
      <AvailabilityGrid
        slots={dstSlots}
        onChange={onChange}
        timeZone="America/Denver"
        locale="en-US"
      />,
    );
    const beforeGap = container.querySelector<HTMLButtonElement>(
      '[data-column="1"][data-row="1"]',
    );
    beforeGap?.focus();
    await user.keyboard("{ArrowDown} ");

    expect(
      container.querySelector('[data-column="1"][data-row="4"]'),
    ).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith({
      "2026-03-08T09:00:00.000Z": "yes",
    });
    await user.keyboard("{ArrowUp}");
    expect(beforeGap).toHaveFocus();
  });

  it.each([
    "day header",
    "time cell",
  ])("opens the mobile day editor from a %s without changing availability", async (target) => {
    mockMobileViewport(true);
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(
      <AvailabilityGrid
        slots={weeklySlots}
        values={{}}
        onChange={onChange}
        timeZone="America/Denver"
        locale="en-US"
        weekly
      />,
    );
    const first = container.querySelector<HTMLButtonElement>(
      '[data-column="0"][data-row="0"]',
    );
    if (!first) throw new Error("Missing Monday cell");

    await user.click(
      target === "day header"
        ? screen.getByRole("button", { name: "Edit Monday" })
        : first,
    );

    expect(container.querySelector('[data-grid-view="day"]')).toBeVisible();
    expect(screen.getByRole("heading", { name: "Monday" })).toBeVisible();
    expect(screen.getByRole("button", { name: "All days" })).toBeVisible();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("5:30 PM", { exact: true })).toBeVisible();
  });

  it.each([
    "yes",
    "maybe",
    "no",
  ] as const)("applies the %s brush in the mobile day editor", async (brush) => {
    mockMobileViewport(true);
    const user = userEvent.setup();
    const { container } = render(
      <EditableGrid
        weekly
        brush={brush}
        initialValues={{ [weeklySlots[0].start]: "yes" }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Edit Monday" }));
    const first = container.querySelector<HTMLButtonElement>(
      '[data-column="0"][data-row="0"]',
    );
    if (!first) throw new Error("Missing day editor cell");

    touchTap(first);

    expect(first).toHaveAttribute(
      "aria-pressed",
      brush === "no" ? "false" : "true",
    );
    expect(first).toHaveAccessibleName(
      brush === "maybe" ? /if need be/i : new RegExp(`: ${brush}$`, "i"),
    );
  });

  it("opens the day editor for a touch tap on a wide screen without painting", () => {
    const onChange = vi.fn();
    const { container } = render(
      <AvailabilityGrid
        slots={weeklySlots}
        onChange={onChange}
        timeZone="America/Denver"
        locale="en-US"
        weekly
      />,
    );
    const first = container.querySelector<HTMLButtonElement>(
      '[data-column="0"][data-row="0"]',
    );
    if (!first) throw new Error("Missing Monday cell");

    fireEvent.pointerDown(first, {
      pointerType: "touch",
      pointerId: 1,
      button: 0,
    });
    fireEvent.pointerUp(first, { pointerType: "touch", pointerId: 1 });
    fireEvent.click(first, { detail: 1 });

    expect(container.querySelector('[data-grid-view="day"]')).toBeVisible();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("preserves selections while moving between days and the weekly overview", async () => {
    mockMobileViewport(true);
    const user = userEvent.setup();
    const { container } = render(<EditableGrid weekly />);
    await user.click(screen.getByRole("button", { name: "Edit Monday" }));
    expect(screen.getByRole("button", { name: "Previous day" })).toBeDisabled();
    const monday = container.querySelector<HTMLButtonElement>(
      '[data-column="0"][data-row="0"]',
    );
    if (!monday) throw new Error("Missing Monday cell");
    touchTap(monday);
    await user.click(screen.getByRole("button", { name: "Next day" }));
    expect(screen.getByRole("heading", { name: "Tuesday" })).toBeVisible();
    const tuesday = container.querySelector<HTMLButtonElement>(
      '[data-column="1"][data-row="1"]',
    );
    if (!tuesday) throw new Error("Missing Tuesday cell");
    touchTap(tuesday);
    await user.click(screen.getByRole("button", { name: "Previous day" }));
    expect(
      container.querySelector('[data-column="0"][data-row="0"]'),
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "All days" }));

    expect(
      container.querySelector('[data-grid-view="overview"]'),
    ).toBeVisible();
    expect(container.querySelectorAll("[data-column][data-row]")).toHaveLength(
      weeklySlots.length,
    );
    expect(
      container.querySelector('[data-column="0"][data-row="0"]'),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      container.querySelector('[data-column="1"][data-row="1"]'),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      container.querySelector('[data-column="1"][data-row="0"]'),
    ).toHaveAttribute("aria-pressed", "false");
    await user.click(screen.getByRole("button", { name: "Edit Sunday" }));
    expect(screen.getByRole("button", { name: "Next day" })).toBeDisabled();
  });

  it("keeps an open day editor usable after resizing to a desktop viewport", async () => {
    const resize = mockMobileViewport(true);
    const user = userEvent.setup();
    const { container } = render(<EditableGrid weekly />);
    await user.click(screen.getByRole("button", { name: "Edit Monday" }));

    resize(false);

    expect(container.querySelector('[data-grid-view="day"]')).toBeVisible();
    const first = container.querySelector<HTMLButtonElement>(
      '[data-column="0"][data-row="0"]',
    );
    const viewport = container.querySelector<HTMLDivElement>(".overflow-auto");
    if (!first || !viewport) throw new Error("Missing day editor cell");
    viewport.setPointerCapture = vi.fn();
    await user.click(first);
    expect(first).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "All days" }));
    expect(
      container.querySelector('[data-grid-view="overview"]'),
    ).toBeVisible();
  });

  it("returns to the overview if the edited date is removed", async () => {
    mockMobileViewport(true);
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container, rerender } = render(
      <AvailabilityGrid
        slots={weeklySlots}
        onChange={onChange}
        timeZone="America/Denver"
        locale="en-US"
        weekly
      />,
    );
    await user.click(screen.getByRole("button", { name: "Edit Monday" }));

    rerender(
      <AvailabilityGrid
        slots={weeklySlots.filter((slot) => slot.date !== weeklySlots[0].date)}
        onChange={onChange}
        timeZone="America/Denver"
        locale="en-US"
        weekly
      />,
    );

    expect(
      container.querySelector('[data-grid-view="overview"]'),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "All days" })).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("supports keyboard selection and restores focus when leaving a day", async () => {
    mockMobileViewport(true);
    const user = userEvent.setup();
    const { container } = render(<EditableGrid weekly />);
    await user.click(screen.getByRole("button", { name: "Edit Monday" }));
    expect(
      container.querySelector('[data-column="0"][data-row="0"]'),
    ).toHaveFocus();

    await user.keyboard("{ArrowDown} {ArrowRight}");

    const selected = container.querySelector('[data-column="0"][data-row="1"]');
    expect(selected).toHaveFocus();
    expect(selected).toHaveAttribute("aria-pressed", "true");
    await user.keyboard("{Escape}");
    expect(
      container.querySelector('[data-grid-view="overview"]'),
    ).toBeVisible();
    expect(
      container.querySelector('[data-column="0"][data-row="1"]'),
    ).toHaveFocus();
  });

  it.each([
    "overview",
    "day",
  ])("ignores a cancelled touch in the mobile %s until the next gesture", async (view) => {
    mockMobileViewport(true);
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(
      <AvailabilityGrid
        slots={weeklySlots}
        onChange={onChange}
        timeZone="America/Denver"
        locale="en-US"
        weekly
      />,
    );
    if (view === "day") {
      await user.click(screen.getByRole("button", { name: "Edit Monday" }));
    }
    const first = container.querySelector<HTMLButtonElement>(
      '[data-column="0"][data-row="0"]',
    );
    const viewport = container.querySelector<HTMLDivElement>(".overflow-auto");
    if (!first || !viewport) throw new Error("Missing grid");
    fireEvent.pointerDown(first, {
      pointerType: "touch",
      pointerId: 1,
      button: 0,
    });
    fireEvent.pointerCancel(viewport, { pointerType: "touch", pointerId: 1 });
    fireEvent.click(first, { detail: 1 });

    expect(container.querySelector(`[data-grid-view="${view}"]`)).toBeVisible();
    expect(onChange).not.toHaveBeenCalled();

    touchTap(first, 2);

    expect(container.querySelector('[data-grid-view="day"]')).toBeVisible();
    if (view === "day") {
      expect(onChange).toHaveBeenCalledExactlyOnceWith({
        [weeklySlots[0].start]: "yes",
      });
    } else {
      expect(onChange).not.toHaveBeenCalled();
    }
  });

  it.each([
    ["overview", "coalesced swipe"],
    ["day", "coalesced swipe"],
    ["overview", "swipe returning to its start"],
    ["day", "swipe returning to its start"],
  ])("does not treat a %s %s as a tap", async (view, gesture) => {
    mockMobileViewport(true);
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(
      <AvailabilityGrid
        slots={weeklySlots}
        onChange={onChange}
        timeZone="America/Denver"
        locale="en-US"
        weekly
      />,
    );
    if (view === "day") {
      await user.click(screen.getByRole("button", { name: "Edit Monday" }));
    }
    const first = container.querySelector<HTMLButtonElement>(
      '[data-column="0"][data-row="0"]',
    );
    const last = container.querySelector<HTMLButtonElement>(
      '[data-column="0"][data-row="1"]',
    );
    const viewport = container.querySelector<HTMLDivElement>(".overflow-auto");
    if (!first || !last || !viewport) throw new Error("Missing grid");
    fireEvent.pointerDown(last, {
      pointerType: "touch",
      pointerId: 1,
      button: 0,
      clientX: 100,
      clientY: 400,
    });
    const returnsToStart = gesture === "swipe returning to its start";
    if (returnsToStart) {
      fireEvent.pointerMove(viewport, {
        pointerType: "touch",
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      });
    }
    fireEvent.pointerUp(returnsToStart ? last : first, {
      pointerType: "touch",
      pointerId: 1,
      clientX: 100,
      clientY: returnsToStart ? 400 : 100,
    });
    fireEvent.click(returnsToStart ? last : first, { detail: 1 });

    expect(container.querySelector(`[data-grid-view="${view}"]`)).toBeVisible();
    expect(onChange).not.toHaveBeenCalled();

    touchTap(first, 2);

    expect(container.querySelector('[data-grid-view="day"]')).toBeVisible();
    if (view === "day") {
      expect(onChange).toHaveBeenCalledExactlyOnceWith({
        [weeklySlots[0].start]: "yes",
      });
    } else {
      expect(onChange).not.toHaveBeenCalled();
    }
  });

  it("ignores a swipe on a day header but opens the day on the next tap", () => {
    mockMobileViewport(true);
    const onChange = vi.fn();
    const { container } = render(
      <AvailabilityGrid
        slots={weeklySlots}
        onChange={onChange}
        timeZone="America/Denver"
        locale="en-US"
        weekly
      />,
    );
    const header = screen.getByRole("button", { name: "Edit Monday" });
    fireEvent.pointerDown(header, {
      pointerType: "touch",
      pointerId: 1,
      button: 0,
      clientX: 100,
      clientY: 400,
    });
    fireEvent.pointerUp(header, {
      pointerType: "touch",
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.click(header, { detail: 1 });

    expect(
      container.querySelector('[data-grid-view="overview"]'),
    ).toBeVisible();
    expect(onChange).not.toHaveBeenCalled();

    touchTap(header, 2);

    expect(container.querySelector('[data-grid-view="day"]')).toBeVisible();
    expect(screen.getByRole("heading", { name: "Monday" })).toBeVisible();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("leaves touch scrolling alone until paint mode is selected", async () => {
    mockMobileViewport(true);
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(
      <AvailabilityGrid
        slots={weeklySlots}
        values={{}}
        onChange={onChange}
        timeZone="UTC"
        locale="en-US"
        weekly
      />,
    );
    await user.click(screen.getByRole("button", { name: "Edit Monday" }));
    const first = container.querySelector<HTMLButtonElement>("[data-column]");
    const viewport = container.querySelector<HTMLDivElement>(".overflow-auto");
    if (!first || !viewport) throw new Error("Missing grid");
    viewport.setPointerCapture = vi.fn();
    fireEvent.pointerDown(first, {
      pointerType: "touch",
      button: 0,
      pointerId: 1,
    });
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Paint" }));
    fireEvent.pointerDown(first, {
      pointerType: "touch",
      button: 0,
      pointerId: 2,
    });
    expect(onChange).toHaveBeenCalledWith({ [weeklySlots[0].start]: "yes" });
  });

  it("marks a touch tap when the browser sends a MouseEvent click", async () => {
    mockMobileViewport(true);
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(
      <AvailabilityGrid
        slots={weeklySlots}
        values={{}}
        brush="maybe"
        onChange={onChange}
        timeZone="UTC"
        locale="en-US"
        weekly
      />,
    );
    await user.click(screen.getByRole("button", { name: "Edit Monday" }));
    const first = container.querySelector<HTMLButtonElement>("[data-column]");
    if (!first) throw new Error("Missing grid cell");

    fireEvent.pointerDown(first, {
      pointerType: "touch",
      button: 0,
      pointerId: 1,
    });
    fireEvent.pointerUp(first, { pointerType: "touch", pointerId: 1 });
    fireEvent.click(first, { detail: 1 });

    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      [weeklySlots[0].start]: "maybe",
    });
  });

  it("does not repaint the starting cell after a touch drag", async () => {
    mockMobileViewport(true);
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(
      <AvailabilityGrid
        slots={weeklySlots}
        values={{}}
        onChange={onChange}
        timeZone="UTC"
        locale="en-US"
        weekly
      />,
    );
    await user.click(screen.getByRole("button", { name: "Edit Monday" }));
    const first = container.querySelector<HTMLButtonElement>(
      '[data-column="0"][data-row="0"]',
    );
    const last = container.querySelector<HTMLButtonElement>(
      '[data-column="0"][data-row="1"]',
    );
    const viewport = container.querySelector<HTMLDivElement>(".overflow-auto");
    if (!first || !last || !viewport) throw new Error("Missing grid");
    viewport.setPointerCapture = vi.fn();
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => last),
    });
    await user.click(screen.getByRole("button", { name: "Paint" }));

    fireEvent.pointerDown(first, {
      pointerType: "touch",
      button: 0,
      pointerId: 1,
    });
    fireEvent.pointerMove(viewport, {
      pointerType: "touch",
      pointerId: 1,
      clientX: 30,
      clientY: 40,
    });
    fireEvent.pointerUp(viewport, { pointerType: "touch", pointerId: 1 });
    const changesBeforeClick = onChange.mock.calls.length;
    fireEvent.click(first, { detail: 1 });

    expect(onChange).toHaveBeenCalledTimes(changesBeforeClick);
    expect(onChange).toHaveBeenLastCalledWith(
      Object.fromEntries(
        weeklySlots.slice(0, 2).map((slot) => [slot.start, "yes"]),
      ),
    );
  });

  it.each([
    "pointerUp",
    "pointerCancel",
  ] as const)("stops painting when a gesture ends with %s", (endGesture) => {
    const onChange = vi.fn();
    const { container } = render(
      <AvailabilityGrid
        slots={slots}
        values={{}}
        onChange={onChange}
        timeZone="UTC"
        locale="en-US"
      />,
    );
    const first = container.querySelector<HTMLButtonElement>(
      '[data-column="0"][data-row="0"]',
    );
    const last = container.querySelector<HTMLButtonElement>(
      '[data-column="1"][data-row="1"]',
    );
    const viewport = container.querySelector<HTMLDivElement>(".overflow-auto");
    if (!first || !last || !viewport) throw new Error("Missing grid");
    viewport.setPointerCapture = vi.fn();
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => last),
    });

    fireEvent.pointerDown(first, {
      pointerType: "mouse",
      button: 0,
      pointerId: 1,
    });
    expect(onChange).toHaveBeenCalledWith({ [slots[0].start]: "yes" });
    fireEvent[endGesture](viewport, { pointerId: 1 });
    onChange.mockClear();
    fireEvent.pointerMove(viewport, {
      pointerType: "mouse",
      pointerId: 1,
      clientX: 30,
      clientY: 40,
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps the grid keyboard accessible when its dates are replaced", async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(
      <AvailabilityGrid slots={slots} timeZone="UTC" locale="en-US" />,
    );
    await user.tab();
    await user.keyboard("{ArrowRight}{ArrowDown}");

    const nextSlots = slots.map((slot) => ({
      ...slot,
      start: slot.start.replace("2026-10", "2026-11"),
      end: slot.end.replace("2026-10", "2026-11"),
      date: slot.date.replace("2026-10", "2026-11"),
    }));
    rerender(
      <AvailabilityGrid slots={nextSlots} timeZone="UTC" locale="en-US" />,
    );

    const entryCells = container.querySelectorAll<HTMLButtonElement>(
      '[data-column][tabindex="0"]',
    );
    expect(entryCells).toHaveLength(1);
    await user.tab();
    expect(entryCells[0]).toHaveFocus();
    await user.keyboard("{ArrowRight}{ArrowDown}");
    expect(
      container.querySelector('[data-column="1"][data-row="1"]'),
    ).toHaveFocus();
  });

  it("explains when no time slots are available", () => {
    const { container } = render(
      <AvailabilityGrid slots={[]} timeZone="UTC" locale="en-US" />,
    );

    expect(
      screen.getByText(/no (?:time slots|times|availability)/i),
    ).toBeVisible();
    expect(container.querySelectorAll("[data-column]")).toHaveLength(0);
  });

  it("shows tentative response counts when inspecting a result", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AvailabilityGrid
        slots={slots}
        counts={{ [slots[0].start]: { yes: 1, maybe: 2 } }}
        participantCount={4}
        timeZone="UTC"
        locale="en-US"
      />,
    );

    const first = container.querySelector<HTMLButtonElement>(
      '[data-column="0"][data-row="0"]',
    );
    expect(first?.textContent).toBe("");
    await user.tab();
    const detail = container.querySelector('[aria-live="polite"]');
    expect(detail).toBeVisible();
    await waitFor(() => {
      expect(detail).toHaveTextContent(/1 yes/i);
      expect(detail).toHaveTextContent(/2 maybe/i);
    });
  });

  it("shows the converted date when a time falls on the next local day", () => {
    const { container } = render(
      <AvailabilityGrid
        slots={slots}
        timeZone="Australia/Sydney"
        locale="en-US"
      />,
    );
    const first = container.querySelector<HTMLButtonElement>(
      '[data-column="0"][data-row="0"]',
    );
    if (!first) throw new Error("Missing time cell");

    expect(first).toBeVisible();
    expect(first).toHaveAccessibleName(/Oct(?:ober)? 21/);
    expect(within(first).getByText(/Oct(?:ober)? 21/)).toBeVisible();
    expect(first).not.toHaveTextContent("5:00 AM");
    expect(screen.getByText("5:00 AM", { exact: true })).toBeVisible();
  });

  it("keeps the converted date visible when editing a day on mobile", async () => {
    mockMobileViewport(true);
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(
      <AvailabilityGrid
        slots={slots}
        onChange={onChange}
        timeZone="Australia/Sydney"
        locale="en-US"
      />,
    );
    const overviewCell = container.querySelector<HTMLButtonElement>(
      '[data-column="0"][data-row="0"]',
    );
    if (!overviewCell) throw new Error("Missing time cell");
    expect(within(overviewCell).getByText(/Oct(?:ober)? 21/)).toBeVisible();

    await user.click(overviewCell);

    const editorCell = container.querySelector<HTMLButtonElement>(
      '[data-column="0"][data-row="0"]',
    );
    if (!editorCell) throw new Error("Missing day editor cell");
    expect(container.querySelector('[data-grid-view="day"]')).toBeVisible();
    expect(editorCell).toHaveAccessibleName(/Oct(?:ober)? 21/);
    expect(within(editorCell).getByText(/Oct(?:ober)? 21/)).toBeVisible();
    expect(onChange).not.toHaveBeenCalled();
  });
});
