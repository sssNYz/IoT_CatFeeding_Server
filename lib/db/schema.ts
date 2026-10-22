import { boolean, integer, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Times stay Thai-time strings from the database (spec Section 2): mode "string", never JS Date.
const thaiTime = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });

export const role = pgEnum("role", ["owner", "admin"]);
export const deviceState = pgEnum("device_state", ["online", "offline"]);

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
