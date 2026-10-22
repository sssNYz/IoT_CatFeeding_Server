CREATE TABLE "schedules" (
	"feeder_id" text NOT NULL,
	"schedule_id" text NOT NULL,
	"time" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Bangkok' NOT NULL,
	"portion_g" integer NOT NULL,
	"sound_id" text,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "schedules_feeder_id_schedule_id_pk" PRIMARY KEY("feeder_id","schedule_id")
);
--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_feeder_id_feeders_id_fk" FOREIGN KEY ("feeder_id") REFERENCES "public"."feeders"("id") ON DELETE cascade ON UPDATE no action;