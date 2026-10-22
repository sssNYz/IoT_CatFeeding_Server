CREATE TABLE "cats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"rfid_tag" text NOT NULL,
	CONSTRAINT "cats_rfid_tag_unique" UNIQUE("rfid_tag")
);
--> statement-breakpoint
ALTER TABLE "cats" ADD CONSTRAINT "cats_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;