-- Deleted polls are inaccessible and cannot accept new responses. Adopt the
-- half-hour setting without rewriting their historical availability intervals.
-- A future restore flow must reconcile any partial half-hour answers explicitly.
-- Active polls still pass the strict compatibility checks in the next migration.
BEGIN;

LOCK TABLE "polls" IN SHARE ROW EXCLUSIVE MODE;

UPDATE "polls"
SET "availability_config" = jsonb_set("availability_config", '{slotMinutes}', '30'::jsonb)
WHERE "scheduling_mode" = 'availability'
  AND "deleted" = true
  AND ("availability_config" ->> 'slotMinutes')::integer <> 30;

COMMIT;
