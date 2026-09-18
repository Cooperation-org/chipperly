ALTER TABLE "activity_steps" ADD COLUMN "parent_step_id" uuid;
--> statement-breakpoint
CREATE INDEX "activity_steps_parent_step_id_idx" ON "activity_steps" USING btree ("parent_step_id");
--> statement-breakpoint
ALTER TABLE "chip_ledger" ADD COLUMN "mood_level" integer;
