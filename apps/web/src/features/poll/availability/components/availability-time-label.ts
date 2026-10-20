import { formatDateTime, formatDateTimeRange } from "@/lib/datetime/format";

/** Weekly slot dates are internal keys and must never appear in the interface. */
export function formatAvailabilityTimeRange({
  start,
  end,
  locale,
  timeZone,
  weekly = false,
}: {
  start: string;
  end: string;
  locale: string;
  timeZone: string;
  weekly?: boolean;
}) {
  if (!weekly) {
    return formatDateTimeRange(new Date(start), new Date(end), {
      locale,
      timeZone,
      preset: "datetime",
      showTimeZone: true,
    });
  }

  const weekday = formatDateTime(new Date(start), {
    locale,
    timeZone,
    preset: "weekday",
  });
  const from = formatDateTime(new Date(start), {
    locale,
    timeZone,
    preset: "time",
  });
  const until = formatDateTime(new Date(end), {
    locale,
    timeZone,
    preset: "time",
  });
  return `${weekday}, ${from} – ${until}`;
}
