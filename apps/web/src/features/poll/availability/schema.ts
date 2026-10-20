import * as z from "zod";
import { normalizeTimeZone } from "@/lib/datetime/utils";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((date) => {
    const parsed = new Date(`${date}T00:00:00.000Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === date
    );
  }, "Choose a valid calendar date");

export const availabilityConfigSchema = z
  .object({
    // Older stored polls have no mode and retain their specific dates.
    mode: z.enum(["weekly", "dates"]).default("dates"),
    dates: z.array(dateSchema).max(31).default([]),
    timeZone: z
      .string()
      .min(1)
      .max(100)
      .refine(
        (timeZone) => !!normalizeTimeZone(timeZone),
        "Choose a valid time zone",
      ),
    startMinute: z.number().int().min(0).max(1425),
    endMinute: z.number().int().min(15).max(1440),
    slotMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]),
    durationMinutes: z.number().int().min(15).max(1440).default(120),
  })
  .superRefine((config, ctx) => {
    if (config.mode === "weekly" && config.dates.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["dates"],
        message: "Weekly availability does not use calendar dates",
      });
    } else if (config.mode === "dates" && config.dates.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["dates"],
        message: "Choose at least one calendar date",
      });
    }
    if (new Set(config.dates).size !== config.dates.length) {
      ctx.addIssue({
        code: "custom",
        path: ["dates"],
        message: "Choose each date once",
      });
    }
    const dates = config.dates.map((date) => Date.parse(date));
    if (Math.max(...dates) - Math.min(...dates) > 92 * 86_400_000) {
      ctx.addIssue({
        code: "custom",
        path: ["dates"],
        message: "Keep dates within three months",
      });
    }
    if (
      config.endMinute <= config.startMinute ||
      config.startMinute % 15 !== 0 ||
      (config.endMinute - config.startMinute) % config.slotMinutes !== 0
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["endMinute"],
        message: "Choose a time range aligned to the grid",
      });
    }
    if (
      config.durationMinutes % config.slotMinutes !== 0 ||
      config.durationMinutes > config.endMinute - config.startMinute
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["durationMinutes"],
        message: "Choose a duration that fits the time range and grid",
      });
    }
  });

export const availabilityIntervalSchema = z.object({
  start: z.iso.datetime(),
  end: z.iso.datetime(),
  type: z.enum(["yes", "ifNeedBe"]),
});

// Includes room for the repeated hour on daylight saving transitions.
export const availabilityIntervalsSchema = z
  .array(availabilityIntervalSchema)
  .max(3100);

const pollIdSchema = z.string().min(1).max(100);

export const createAvailabilityPollSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  location: z.string().trim().max(500).optional(),
  // Stored polls may still use a legacy grid until the data migration runs.
  // New submissions must not recreate those grids.
  config: availabilityConfigSchema.refine(
    (config) => config.slotMinutes === 30,
    {
      path: ["slotMinutes"],
      message: "New polls use 30-minute increments",
    },
  ),
});

export const saveAvailabilityResponseSchema = z.object({
  pollId: pollIdSchema,
  participantId: z.string().min(1).max(100).optional(),
  responseToken: z.string().min(32).max(256).optional(),
  name: z.string().trim().min(1).max(100),
  intervals: availabilityIntervalsSchema,
});

export const finalizeAvailabilityPollSchema = z.object({
  pollId: pollIdSchema,
  start: z.iso.datetime(),
  end: z.iso.datetime(),
});
