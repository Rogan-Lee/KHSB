-- 2026-07-03 도시락 변경요청 스레드 — LunchChangeRequest (추가 전용, 멱등)
-- LunchOrder.changeRequest/changeRequestedAt 컬럼은 남겨두되 미사용(무해).
BEGIN;

CREATE TABLE IF NOT EXISTS "LunchChangeRequest" (
  "id"            TEXT PRIMARY KEY,
  "studentId"     TEXT NOT NULL,
  "message"       TEXT NOT NULL,
  "reply"         TEXT,
  "repliedByName" TEXT,
  "repliedAt"     TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "LunchChangeRequest_studentId_idx" ON "LunchChangeRequest" ("studentId");

DO $$ BEGIN
  ALTER TABLE "LunchChangeRequest" ADD CONSTRAINT "LunchChangeRequest_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

COMMIT;
