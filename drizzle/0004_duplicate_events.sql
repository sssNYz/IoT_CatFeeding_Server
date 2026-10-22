CREATE TABLE "duplicate_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"feeder_id" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "duplicate_events" ADD CONSTRAINT "duplicate_events_feeder_id_feeders_id_fk" FOREIGN KEY ("feeder_id") REFERENCES "public"."feeders"("id") ON DELETE cascade ON UPDATE no action;