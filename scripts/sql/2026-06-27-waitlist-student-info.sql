-- 2026-06-27 대기자 학생 정보 — school/grade (추가 전용, 멱등)
BEGIN;
ALTER TABLE "Waitlist" ADD COLUMN IF NOT EXISTS "school" TEXT;
ALTER TABLE "Waitlist" ADD COLUMN IF NOT EXISTS "grade"  TEXT;
COMMIT;
