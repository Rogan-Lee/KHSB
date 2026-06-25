-- 2026-06-26 대기자 ↔ 원생 연동 + 신청 유형 (추가 전용, 멱등)
-- 적용: psql "<PROD_DIRECT_URL>" -f scripts/sql/2026-06-26-waitlist-student-link.sql
BEGIN;
DO $$ BEGIN CREATE TYPE "WaitlistKind" AS ENUM ('WAITLIST','INQUIRY'); EXCEPTION WHEN duplicate_object THEN null; END $$;
ALTER TABLE "Waitlist" ADD COLUMN IF NOT EXISTS "kind" "WaitlistKind" NOT NULL DEFAULT 'WAITLIST';
ALTER TABLE "Waitlist" ADD COLUMN IF NOT EXISTS "studentId" TEXT;
ALTER TABLE "Waitlist" ALTER COLUMN "gender" DROP NOT NULL;
ALTER TABLE "Waitlist" ALTER COLUMN "gradeType" DROP NOT NULL;
DO $$ BEGIN
  ALTER TABLE "Waitlist" ADD CONSTRAINT "Waitlist_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE INDEX IF NOT EXISTS "Waitlist_studentId_idx" ON "Waitlist"("studentId");
COMMIT;
