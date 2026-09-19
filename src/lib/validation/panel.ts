import { z } from "zod";
import { MAX_COMMAND_LENGTH, MAX_EDITABLE_FILE_BYTES } from "@/lib/constants";

/** Paths are validated properly by normalizePath; this only bounds the input. */
const pathInput = z.string().max(400);

export const writeFileSchema = z.object({
  path: pathInput.min(1),
  // A generous character bound; the byte limit is enforced by the service.
  content: z.string().max(MAX_EDITABLE_FILE_BYTES),
});

export const createDirectorySchema = z.object({ path: pathInput.min(1) });

export const commandSchema = z.object({
  command: z.string().trim().min(1).max(MAX_COMMAND_LENGTH),
});

export const moderatePlayerSchema = z.object({
  action: z.enum(["kick", "ban", "op", "deop"]),
  player: z.string().min(1).max(32),
});

export const taskSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    action: z.enum(["RESTART", "BACKUP", "COMMAND"]),
    payload: z.string().trim().max(MAX_COMMAND_LENGTH).optional().nullable(),
    frequency: z.enum(["HOURLY", "DAILY", "WEEKLY"]),
    everyHours: z.number().int().min(1).max(24).default(1),
    minuteOfDayUtc: z
      .number()
      .int()
      .min(0)
      .max(24 * 60 - 1)
      .default(0),
    dayOfWeekUtc: z.number().int().min(0).max(6).default(0),
    enabled: z.boolean().default(true),
  })
  .refine((task) => task.action !== "COMMAND" || Boolean(task.payload), {
    path: ["payload"],
    message: "command_required",
  });

export type TaskInput = z.infer<typeof taskSchema>;
