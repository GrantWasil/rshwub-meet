import * as z from "zod";

export const manageAvailabilityPollSchema = z.object({
  pollId: z.string().min(1).max(100),
});

export const editAvailabilityPollSchema = manageAvailabilityPollSchema.extend({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000),
  location: z.string().trim().max(500),
});

export const changeAvailabilityPollStatusSchema =
  manageAvailabilityPollSchema.extend({
    status: z.enum(["open", "closed"]),
  });
