-- Expand incompatible unanswered windows to half-hour clock boundaries before the
-- half-hour slot migration. There are no saved answers to reinterpret here.
-- Answered polls retain their exact windows and must pass the next migration's
-- compatibility checks.
BEGIN;

LOCK TABLE "polls", "participants" IN SHARE ROW EXCLUSIVE MODE;

UPDATE "polls" AS poll
SET "availability_config" = jsonb_set(
  jsonb_set(
    poll."availability_config",
    '{startMinute}',
    to_jsonb(((poll."availability_config" ->> 'startMinute')::integer / 30) * 30)
  ),
  '{endMinute}',
  to_jsonb((((poll."availability_config" ->> 'endMinute')::integer + 29) / 30) * 30)
)
WHERE poll."scheduling_mode" = 'availability'
  AND (poll."availability_config" ->> 'slotMinutes')::integer <> 30
  AND (
    (poll."availability_config" ->> 'endMinute')::integer
    - (poll."availability_config" ->> 'startMinute')::integer
  ) % 30 <> 0
  AND NOT EXISTS (
    SELECT 1 FROM "participants" AS participant
    WHERE participant."poll_id" = poll."id"
      AND COALESCE(participant."availability", '[]'::jsonb) <> '[]'::jsonb
  );

COMMIT;
