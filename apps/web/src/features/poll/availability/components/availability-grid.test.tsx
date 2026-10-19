import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@/test/test-utils";
import type { GridVote } from "./availability-grid";
import { AvailabilityGrid } from "./availability-grid";

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
});
