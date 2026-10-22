CREATE TYPE "public"."feed_result" AS ENUM('ok', 'jam', 'missed', 'error');--> statement-breakpoint
CREATE TYPE "public"."feed_trigger" AS ENUM('schedule', 'remote', 'button');--> statement-breakpoint
CREATE TYPE "public"."rfid_result" AS ENUM('tag', 'unknown', 'multiple');--> statement-breakpoint
CREATE TABLE "feeding_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"feeder_id" text NOT NULL,
	"trigger" "feed_trigger" NOT NULL,
	"schedule_id" text,
	"command_id" text,
	"scheduled_at" timestamp with time zone,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"target_portion_g" numeric NOT NULL,
	"bowl_before_g" numeric,
	"bowl_after_g" numeric,
	"rfid_result" "rfid_result" NOT NULL,
	"rfid_tag" text,
	"result" "feed_result" NOT NULL,
	"raw" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feeding_events" ADD CONSTRAINT "feeding_events_feeder_id_feeders_id_fk" FOREIGN KEY ("feeder_id") REFERENCES "public"."feeders"("id") ON DELETE cascade ON UPDATE no action;