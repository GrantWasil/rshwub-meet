ALTER TABLE "polls" ADD COLUMN "finalized_option_id" TEXT;
CREATE UNIQUE INDEX "polls_finalized_option_id_key" ON "polls"("finalized_option_id");
ALTER TABLE "polls" ADD CONSTRAINT "polls_finalized_option_id_fkey"
  FOREIGN KEY ("finalized_option_id") REFERENCES "options"("id") ON DELETE SET NULL ON UPDATE CASCADE;
