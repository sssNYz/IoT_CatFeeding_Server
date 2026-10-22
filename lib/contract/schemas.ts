import { z } from "./registry";

// ---------- Shared ----------

/** Every time in the API is Thai time with an explicit +07:00 offset (spec Section 2). */
export const ThaiDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?\+07:00$/, "Must be ISO 8601 with +07:00")
  .openapi({ example: "2026-11-02T07:00:03+07:00", description: "Thai time (Asia/Bangkok), always +07:00" });

export const FeederId = z
  .string()
  .regex(/^[a-z0-9-]{3,32}$/)
  .openapi({ example: "feeder01", description: "The feeder's device_id" });

export const ErrorResponse = z
  .object({
    error: z.object({
      code: z
        .enum(["unauthorized", "forbidden", "not_found", "validation_error", "conflict"])
        .openapi({ example: "validation_error" }),
      message: z.string().openapi({ example: "portion_g must be between 5 and 100" }),
      details: z
        .array(z.object({ field: z.string(), message: z.string() }))
        .optional()
        .openapi({ example: [{ field: "portion_g", message: "Too big: expected <= 100" }] }),
    }),
  })
  .openapi("Error");

// ---------- Auth ----------

export const Role = z.enum(["owner", "admin"]).openapi("Role");

export const User = z
  .object({
    id: z.string().uuid().openapi({ example: "6f1c2b8e-1d2a-4c3b-9e8f-0a1b2c3d4e5f" }),
    email: z.string().email().openapi({ example: "owner@catfeeder.test" }),
    role: Role,
  })
  .openapi("User");

export const LoginRequest = z
  .object({
    email: z.string().email().openapi({ example: "owner@catfeeder.test" }),
    password: z.string().min(1).openapi({ example: "change-me" }),
  })
  .openapi("LoginRequest");

export const LoginResponse = z
  .object({
    token: z.string().openapi({ example: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOi..." }),
    expires_at: ThaiDateTime.openapi({ example: "2026-11-05T08:15:00+07:00" }),
    user: User,
  })
  .openapi("LoginResponse");

// ---------- Feeders + status ----------

export const DeviceState = z.enum(["online", "offline", "unknown"]).openapi("DeviceState", {
  description: "`unknown` = the feeder has never connected",
});

export const FeederStatus = z
  .object({
    feeder_id: FeederId,
    state: DeviceState,
    last_seen: ThaiDateTime.nullable(),
    fw: z.string().nullable().openapi({ example: "0.3.0" }),
    schedule_version: z.number().int().openapi({ example: 12, description: "Newest version on the server" }),
    applied_schedule_version: z
      .number()
      .int()
      .nullable()
      .openapi({ example: 12, description: "Version the feeder last reported" }),
    synced: z.boolean().openapi({
      example: true,
      description: "true when applied_schedule_version equals schedule_version. Show 'Synced ✓' or 'Waiting for feeder…'",
    }),
  })
  .openapi("FeederStatus");

export const Feeder = z
  .object({
    id: FeederId,
    name: z.string().openapi({ example: "Kitchen feeder" }),
    owner_id: z.string().uuid().nullable().openapi({ description: "null until the admin pairs it" }),
    paired_at: ThaiDateTime.nullable(),
    status: FeederStatus,
  })
  .openapi("Feeder");

export const PairRequest = z
  .object({ owner_id: z.string().uuid() })
  .openapi("PairRequest");

export const PairResponse = z
  .object({
    feeder_id: FeederId,
    owner_id: z.string().uuid(),
    mqtt_username: z.string().openapi({ example: "feeder01" }),
    mqtt_password: z.string().openapi({ example: "q7Vd9...k2", description: "Shown once. Put it in secrets.h" }),
    device_token: z.string().openapi({ example: "dt_8sJ2...pQ", description: "Shown once. Put it in secrets.h" }),
    paired_at: ThaiDateTime,
  })
  .openapi("PairResponse");

// ---------- Schedules ----------

export const ScheduleTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Must be HH:MM, 24-hour")
  .openapi({ example: "07:00", description: "Daily time, Thai time, 24-hour HH:MM" });

export const PortionG = z
  .number()
  .int()
  .min(5)
  .max(100)
  .openapi({ example: 40, description: "Grams of food, 5 to 100" });

export const Schedule = z
  .object({
    schedule_id: z.string().openapi({ example: "morning-feed" }),
    time: ScheduleTime,
    portion_g: PortionG,
    sound_id: z.string().nullable().openapi({ example: "snd-01" }),
    enabled: z.boolean().openapi({ example: true }),
  })
  .openapi("Schedule");

export const ScheduleInput = z
  .object({
    schedule_id: z
      .string()
      .regex(/^[a-z0-9-]{1,40}$/)
      .optional()
      .openapi({ example: "morning-feed", description: "Omit to create a new schedule; send an existing one to update it" }),
    time: ScheduleTime,
    portion_g: PortionG,
    sound_id: z.string().nullable().optional().openapi({ example: "snd-01" }),
    enabled: z.boolean().default(true),
  })
  .openapi("ScheduleInput");

export const ScheduleList = z
  .object({
    feeder_id: FeederId,
    schedule_version: z.number().int().openapi({ example: 12 }),
    timezone: z.literal("Asia/Bangkok"),
    schedules: z.array(Schedule),
  })
  .openapi("ScheduleList");

export const ScheduleSaved = z
  .object({
    schedule: Schedule,
    schedule_version: z.number().int().openapi({ example: 13 }),
  })
  .openapi("ScheduleSaved", {
    description: "Saved and published to the feeder. Not proof the feeder has it: check `synced` in the status.",
  });

export const ScheduleDeleted = z
  .object({ schedule_version: z.number().int().openapi({ example: 14 }) })
  .openapi("ScheduleDeleted");

// ---------- Manual feed ----------

export const FeedCommandRequest = z
  .object({
    portion_g: PortionG,
    sound_id: z.string().nullable().optional().openapi({ example: "snd-01" }),
  })
  .openapi("FeedCommandRequest");

export const CommandStatus = z.enum(["sent", "done"]).openapi("CommandStatus", {
  description: "`sent` = published to the feeder. `done` = a feeding event with this command_id arrived",
});

export const FeedCommand = z
  .object({
    command_id: z.string().openapi({ example: "cmd-3f9c2a" }),
    feeder_id: FeederId,
    portion_g: PortionG,
    issued_at: ThaiDateTime.openapi({ example: "2026-11-02T08:15:00+07:00" }),
    status: CommandStatus,
    event_id: z.string().nullable().openapi({ example: null, description: "Set when status is done" }),
  })
  .openapi("FeedCommand");

// ---------- Cats ----------

export const Cat = z
  .object({
    id: z.string().uuid(),
    name: z.string().openapi({ example: "Mochi" }),
    rfid_tag: z.string().openapi({ example: "E200001A" }),
  })
  .openapi("Cat");

export const CatInput = z
  .object({
    name: z.string().min(1).max(40).openapi({ example: "Mochi" }),
    rfid_tag: z.string().regex(/^[0-9A-F]{4,32}$/).openapi({ example: "E200001A", description: "Uppercase hex" }),
  })
  .openapi("CatInput");

// ---------- Feeding events ----------

export const Trigger = z.enum(["schedule", "remote", "button"]).openapi("Trigger");
export const FeedResult = z.enum(["ok", "jam", "missed", "error"]).openapi("FeedResult");
export const RfidResult = z.enum(["tag", "unknown", "multiple"]).openapi("RfidResult", {
  description: "`tag` = one tag read. A tag only means 'likely visitor' (shared bowl)",
});

export const FeedingEvent = z
  .object({
    event_id: z.string().openapi({ example: "feeder01-0f7e1c" }),
    feeder_id: FeederId,
    trigger: Trigger,
    schedule_id: z.string().nullable().openapi({ example: "morning-feed" }),
    command_id: z.string().nullable().openapi({ example: null }),
    scheduled_at: ThaiDateTime.nullable().openapi({ example: "2026-11-02T07:00:00+07:00" }),
    occurred_at: ThaiDateTime,
    received_at: ThaiDateTime.openapi({ example: "2026-11-02T07:00:04+07:00" }),
    target_portion_g: z.number().openapi({ example: 40 }),
    bowl_before_g: z.number().nullable().openapi({ example: 12.4 }),
    bowl_after_g: z.number().nullable().openapi({ example: 50.9 }),
    dispensed_g: z.number().nullable().openapi({ example: 38.5, description: "bowl_after_g − bowl_before_g" }),
    rfid: z.object({
      result: RfidResult,
      tag_id: z.string().nullable().openapi({ example: "E200001A" }),
      cat: Cat.pick({ id: true, name: true }).nullable().openapi({ description: "null if the tag is not registered" }),
    }),
    result: FeedResult,
    image_media_id: z
      .string()
      .uuid()
      .nullable()
      .openapi({ description: "Fetch with GET /media/{media_id}. null if no photo (yet)" }),
  })
  .openapi("FeedingEvent");

export const EventsQuery = z.object({
  from: ThaiDateTime.optional().openapi({ description: "History: occurred_at >= from" }),
  to: ThaiDateTime.optional().openapi({ description: "History: occurred_at < to" }),
  since: ThaiDateTime.optional().openapi({
    description:
      "Polling: only events received after this time (received_at > since). Use the newest received_at you have. Catches late events from an outage, which from/to would miss",
  }),
  limit: z.coerce.number().int().min(1).max(200).default(50).optional(),
});

export const EventList = z
  .object({
    events: z.array(FeedingEvent).openapi({ description: "Newest occurred_at first" }),
  })
  .openapi("EventList");

// ---------- Sounds + media ----------

export const Sound = z
  .object({
    sound_id: z.string().openapi({ example: "snd-01" }),
    name: z.string().openapi({ example: "Mochi dinner call" }),
    media_id: z.string().uuid(),
    duration_s: z.number().nullable().openapi({ example: 2.4 }),
    created_at: ThaiDateTime,
  })
  .openapi("Sound");

export const SoundUpload = z
  .object({
    name: z.string().min(1).max(40).openapi({ example: "Mochi dinner call" }),
    file: z.string().openapi({
      type: "string",
      format: "binary",
      description: "Any phone recording (m4a, aac, mp3, wav), max 2 MB. The server converts it to MP3 for the feeder",
    }),
  })
  .openapi("SoundUpload");

export const ImageUpload = z
  .object({
    event_id: z.string().openapi({ example: "feeder01-0f7e1c" }),
    file: z.string().openapi({ type: "string", format: "binary", description: "JPEG, max 1 MB" }),
  })
  .openapi("ImageUpload");

export const ImageSaved = z
  .object({ media_id: z.string().uuid(), event_id: z.string() })
  .openapi("ImageSaved");

// ---------- Admin ----------

export const AdminStats = z
  .object({
    events_total: z.number().int().openapi({ example: 214 }),
    duplicates_rejected: z.number().int().openapi({ example: 7, description: "Objective 4 result" }),
    failed: z.object({
      jam: z.number().int().openapi({ example: 1 }),
      missed: z.number().int().openapi({ example: 2 }),
      error: z.number().int().openapi({ example: 0 }),
    }),
  })
  .openapi("AdminStats");

export const AdminEvent = FeedingEvent.extend({
  raw: z.record(z.string(), z.unknown()).openapi({ description: "The exact MQTT payload the feeder sent" }),
}).openapi("AdminEvent");
