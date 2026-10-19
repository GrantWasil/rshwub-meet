import { cn } from "@rallly/ui";
import { CalendarDaysIcon, Grid2X2Icon } from "lucide-react";
import Link from "next/link";
import { Trans } from "@/i18n/client";

export function SchedulingModeSwitch({
  mode,
}: {
  mode: "options" | "availability";
}) {
  return (
    <nav
      aria-label="Scheduling mode"
      className="mb-5 grid grid-cols-2 gap-2 rounded-xl border bg-card p-1.5"
    >
      <Link
        href="/new"
        aria-current={mode === "options" ? "page" : undefined}
        className={cn(
          "flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm transition-colors hover:bg-muted",
          mode === "options" && "bg-primary/10 font-medium text-primary",
        )}
      >
        <CalendarDaysIcon className="size-4 shrink-0" />
        <Trans
          i18nKey="schedulingModeProposedTimes"
          defaults="Proposed times"
        />
      </Link>
      <Link
        href="/availability/new"
        aria-current={mode === "availability" ? "page" : undefined}
        className={cn(
          "flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm transition-colors hover:bg-muted",
          mode === "availability" && "bg-primary/10 font-medium text-primary",
        )}
      >
        <Grid2X2Icon className="size-4 shrink-0" />
        <Trans
          i18nKey="schedulingModeAvailability"
          defaults="Availability grid"
        />
      </Link>
    </nav>
  );
}
