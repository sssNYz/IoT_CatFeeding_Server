CREATE TYPE "public"."device_state" AS ENUM('online', 'offline');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('owner', 'admin');--> statement-breakpoint
CREATE TABLE "device_status" (
	"feeder_id" text PRIMARY KEY NOT NULL,
	"state" "device_state" NOT NULL,
	"last_seen" timestamp with time zone,
	"fw" text,
	"applied_schedule_version" integer
);
--> statement-breakpoint
CREATE TABLE "feeders" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" uuid,
	"name" text NOT NULL,
	"schedule_version" integer DEFAULT 0 NOT NULL,
	"device_token_hash" text,
	"paired_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "device_status" ADD CONSTRAINT "device_status_feeder_id_feeders_id_fk" FOREIGN KEY ("feeder_id") REFERENCES "public"."feeders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feeders" ADD CONSTRAINT "feeders_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;