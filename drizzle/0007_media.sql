CREATE TYPE "public"."media_kind" AS ENUM('image', 'sound');--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feeder_id" text NOT NULL,
	"kind" "media_kind" NOT NULL,
	"object_key" text NOT NULL,
	"event_id" text,
	"sound_id" text,
	"content_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_feeder_event_unique" UNIQUE("feeder_id","event_id")
);
--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_feeder_id_feeders_id_fk" FOREIGN KEY ("feeder_id") REFERENCES "public"."feeders"("id") ON DELETE cascade ON UPDATE no action;