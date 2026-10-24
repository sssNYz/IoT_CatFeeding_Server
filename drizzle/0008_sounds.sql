ALTER TABLE "media" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "duration_s" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_feeder_sound_unique" UNIQUE("feeder_id","sound_id");