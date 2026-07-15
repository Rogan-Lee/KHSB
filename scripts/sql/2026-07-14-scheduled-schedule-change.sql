-- 2026-07-14 등원 일정 실행 예정일 예약 — ScheduledScheduleChange (추가 전용, 멱등)
BEGIN;

CREATE TABLE IF NOT EXISTS "ScheduledScheduleChange" (
  "id"            TEXT PRIMARY KEY,
  "studentId"     TEXT NOT NULL,
  "effectiveDate" DATE NOT NULL,
  "attendance"    JSONB NOT NULL DEFAULT '[]',
  "outings"       JSONB NOT NULL DEFAULT '[]',
  "appliedAt"     TIMESTAMP(3),
  "createdById"   TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ScheduledScheduleChange_effectiveDate_appliedAt_idx"
  ON "ScheduledScheduleChange" ("effectiveDate", "appliedAt");
CREATE INDEX IF NOT EXISTS "ScheduledScheduleChange_studentId_appliedAt_idx"
  ON "ScheduledScheduleChange" ("studentId", "appliedAt");

DO $$ BEGIN
  ALTER TABLE "ScheduledScheduleChange" ADD CONSTRAINT "ScheduledScheduleChange_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

COMMIT;
