import { boolean, integer, jsonb, numeric, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Times stay Thai-time strings from the database (spec Section 2): mode "string", never JS Date.
const thaiTime = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });

export const role = pgEnum("role", ["owner", "admin"]);
export const deviceState = pgEnum("device_state", ["online", "offline"]);
// Not "trigger": that name is a built-in PostgreSQL pseudo-type.
export const feedTrigger = pgEnum("feed_trigger", ["schedule", "remote", "button"]);
export const rfidResult = pgEnum("rfid_result", ["tag", "unknown", "multiple"]);
export const feedResult = pgEnum("feed_result", ["ok", "jam", "missed", "error"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: role("role").notNull(),
  createdAt: thaiTime("created_at").notNull().defaultNow(),
});

export const feeders = pgTable("feeders", {
  id: text("id").primaryKey(),
  ownerId: uuid("owner_id").references(() => users.id),
  name: text("name").notNull(),
  scheduleVersion: integer("schedule_version").notNull().default(0),
  deviceTokenHash: text("device_token_hash"),
  pairedAt: thaiTime("paired_at"),
});

// One row per feeder once it has reported a status; no row = never connected ("unknown").
export const deviceStatus = pgTable("device_status", {
  feederId: text("feeder_id")
    .primaryKey()
    .references(() => feeders.id, { onDelete: "cascade" }),
  state: deviceState("state").notNull(),
  lastSeen: thaiTime("last_seen"),
  fw: text("fw"),
  appliedScheduleVersion: integer("applied_schedule_version"),
});

// A feeder's daily feeds. The whole set goes to the feeder on every change (spec Section 9, rule 2).
export const schedules = pgTable(
  "schedules",
  {
    feederId: text("feeder_id")
      .notNull()
      .references(() => feeders.id, { onDelete: "cascade" }),
    scheduleId: text("schedule_id").notNull(),
    time: text("time").notNull(), // "HH:MM", Thai time
    timezone: text("timezone").notNull().default("Asia/Bangkok"),
    portionG: integer("portion_g").notNull(),
    soundId: text("sound_id"),
    enabled: boolean("enabled").notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.feederId, t.scheduleId] })],
);

// An owner's cat. A tag read at the bowl only means "likely visitor" (shared bowl), never a certain ID.
export const cats = pgTable("cats", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  rfidTag: text("rfid_tag").notNull().unique(),
});

// Grams as exact decimals: what the scale reported is what is stored (no float4/float8 rounding).
const grams = (name: string) => numeric(name, { mode: "number" });

// One row per event_id: the primary key is the duplicate protection (spec Section 9, rule 1).
export const feedingEvents = pgTable("feeding_events", {
  eventId: text("event_id").primaryKey(),
  feederId: text("feeder_id")
    .notNull()
    .references(() => feeders.id, { onDelete: "cascade" }),
  trigger: feedTrigger("trigger").notNull(),
  scheduleId: text("schedule_id"),
  commandId: text("command_id"),
  scheduledAt: thaiTime("scheduled_at"),
  occurredAt: thaiTime("occurred_at").notNull(),
  // Milliseconds, and the API sends them, so the app can pass received_at back as `since` exactly.
  receivedAt: timestamp("received_at", { withTimezone: true, mode: "string", precision: 3 }).notNull().defaultNow(),
  targetPortionG: grams("target_portion_g").notNull(),
  bowlBeforeG: grams("bowl_before_g"),
  bowlAfterG: grams("bowl_after_g"),
  rfidResult: rfidResult("rfid_result").notNull(),
  rfidTag: text("rfid_tag"),
  result: feedResult("result").notNull(),
  raw: jsonb("raw").notNull(),
});

// One row per rejected resend of an event_id already stored; the count is the objective 4 result.
export const duplicateEvents = pgTable("duplicate_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: text("event_id").notNull(),
  feederId: text("feeder_id")
    .notNull()
    .references(() => feeders.id, { onDelete: "cascade" }),
  receivedAt: thaiTime("received_at").notNull().defaultNow(),
});

// One manual feed from the owner app. done_event_id is filled when the feeding event with this command_id arrives.
export const commands = pgTable("commands", {
  commandId: text("command_id").primaryKey(),
  feederId: text("feeder_id")
    .notNull()
    .references(() => feeders.id, { onDelete: "cascade" }),
  portionG: integer("portion_g").notNull(),
  soundId: text("sound_id"),
  issuedBy: uuid("issued_by")
    .notNull()
    .references(() => users.id),
  issuedAt: thaiTime("issued_at").notNull(),
  doneEventId: text("done_event_id"),
});
