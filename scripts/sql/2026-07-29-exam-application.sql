-- 2026-07-29 모의고사 신청 — ExamApplication + ExamSession.applicationOpen (추가 전용, 멱등)
BEGIN;

DO $$ BEGIN
  CREATE TYPE "ExamApplicationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "ExamSession" ADD COLUMN IF NOT EXISTS "applicationOpen" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "ExamApplication" (
  "id"            TEXT PRIMARY KEY,
  "sessionId"     TEXT NOT NULL,
  "studentId"     TEXT NOT NULL,
  "status"        "ExamApplicationStatus" NOT NULL DEFAULT 'PENDING',
  "memo"          TEXT,
  "appliedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedAt"   TIMESTAMP(3),
  "confirmedById" TEXT,
  "updatedAt"     TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ExamApplication_sessionId_studentId_key" ON "ExamApplication" ("sessionId", "studentId");
CREATE INDEX IF NOT EXISTS "ExamApplication_sessionId_idx" ON "ExamApplication" ("sessionId");
CREATE INDEX IF NOT EXISTS "ExamApplication_studentId_idx" ON "ExamApplication" ("studentId");

DO $$ BEGIN
  ALTER TABLE "ExamApplication" ADD CONSTRAINT "ExamApplication_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "ExamSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ExamApplication" ADD CONSTRAINT "ExamApplication_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

COMMIT;
