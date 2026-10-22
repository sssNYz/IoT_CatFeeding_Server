CREATE TABLE "commands" (
	"command_id" text PRIMARY KEY NOT NULL,
	"feeder_id" text NOT NULL,
	"portion_g" integer NOT NULL,
	"sound_id" text,
	"issued_by" uuid NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"done_event_id" text
);
--> statement-breakpoint
ALTER TABLE "commands" ADD CONSTRAINT "commands_feeder_id_feeders_id_fk" FOREIGN KEY ("feeder_id") REFERENCES "public"."feeders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commands" ADD CONSTRAINT "commands_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;