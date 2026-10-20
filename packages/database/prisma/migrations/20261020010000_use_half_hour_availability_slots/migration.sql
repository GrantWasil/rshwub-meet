-- Availability polls now use half-hour cells. Preserve event dates, time
-- ranges, and durations; do not silently round an incompatible configuration
-- or reinterpret a participant's partial half-hour answer.
BEGIN;

LOCK TABLE "polls", "participants" IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "polls"
    WHERE "scheduling_mode" = 'availability'
      AND ("availability_config" ->> 'slotMinutes')::integer <> 30
      AND (
        ("availability_config" ->> 'durationMinutes')::integer % 30 <> 0
        OR (
          ("availability_config" ->> 'endMinute')::integer
          - ("availability_config" ->> 'startMinute')::integer
        ) % 30 <> 0
      )
  ) THEN
    RAISE EXCEPTION 'Cannot switch availability polls to 30-minute slots: an existing duration or daily time range is not a multiple of 30 minutes.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "participants" AS participant
    JOIN "polls" AS poll ON poll."id" = participant."poll_id"
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(participant."availability", '[]'::jsonb)
    ) AS entry(value)
    CROSS JOIN LATERAL (
      VALUES (entry.value ->> 'start'), (entry.value ->> 'end')
    ) AS boundary(value)
    CROSS JOIN LATERAL (
      SELECT boundary.value::timestamptz AT TIME ZONE
        (poll."availability_config" ->> 'timeZone') AS local_time
    ) AS clock
    WHERE poll."scheduling_mode" = 'availability'
      AND (poll."availability_config" ->> 'slotMinutes')::integer <> 30
      AND (
        (
          EXTRACT(HOUR FROM clock.local_time) * 60
          + EXTRACT(MINUTE FROM clock.local_time)
          - (poll."availability_config" ->> 'startMinute')::integer
        ) % 30 <> 0
        OR EXTRACT(SECOND FROM clock.local_time) <> 0
      )
  ) THEN
    RAISE EXCEPTION 'Cannot switch availability polls to 30-minute slots: a saved response has a partial half-hour answer.';
  END IF;
END $$;

UPDATE "polls"
SET "availability_config" = jsonb_set("availability_config", '{slotMinutes}', '30'::jsonb)
WHERE "scheduling_mode" = 'availability'
  AND ("availability_config" ->> 'slotMinutes')::integer <> 30;

COMMIT;
