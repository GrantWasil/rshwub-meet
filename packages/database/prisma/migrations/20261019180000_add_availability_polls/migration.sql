-- Existing polls keep their proposed-options behavior.
CREATE TYPE "poll_scheduling_mode" AS ENUM ('options', 'availability');

ALTER TABLE "polls"
  ADD COLUMN "scheduling_mode" "poll_scheduling_mode" NOT NULL DEFAULT 'options',
  ADD COLUMN "availability_config" JSONB,
  ADD COLUMN "management_token_hash" TEXT;

ALTER TABLE "participants" ADD COLUMN "availability" JSONB;
