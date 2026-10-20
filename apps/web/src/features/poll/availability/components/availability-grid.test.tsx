import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@/test/test-utils";
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

function EditableGrid() {
  const [values, setValues] = React.useState<Record<string, GridVote>>({});
  return (
    <AvailabilityGrid
      slots={slots}
      values={values}
      brush="yes"
      onChange={setValues}
      timeZone="UTC"
      locale="en-US"
    />
  );
}

afterEach(() => vi.restoreAllMocks());

describe("availability grid interaction", () => {
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

  it("leaves touch scrolling alone until paint mode is selected", async () => {
    const user = userEvent.setup();
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
    expect(onChange).toHaveBeenCalledWith({ [slots[0].start]: "yes" });
  });

  it("marks a touch tap when the browser sends a MouseEvent click", () => {
    const onChange = vi.fn();
    const { container } = render(
      <AvailabilityGrid
        slots={slots}
        values={{}}
        brush="maybe"
        onChange={onChange}
        timeZone="UTC"
        locale="en-US"
      />,
    );
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
      [slots[0].start]: "maybe",
    });
  });

  it("does not repaint the starting cell after a touch drag", async () => {
    const user = userEvent.setup();
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
    fireEvent.click(first, { detail: 1 });

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith(
      Object.fromEntries(slots.map((slot) => [slot.start, "yes"])),
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
    const first = container.querySelector('[data-column="0"][data-row="0"]');

    expect(first).toBeVisible();
    expect(first).toHaveTextContent(/Oct(?:ober)? 21/);
    expect(first).toHaveTextContent("5:00 AM");
  });
});
