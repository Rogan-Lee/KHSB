-- 2026-06-25 대기자 어드민 확장 — 정원/취소사유 (추가 전용, 멱등)
-- 적용: psql "<PROD_DIRECT_URL>" -f scripts/sql/2026-06-25-waitlist-capacity.sql
BEGIN;
ALTER TABLE "Branch"          ADD COLUMN IF NOT EXISTS "capacity"     INTEGER;
ALTER TABLE "WaitlistProgram" ADD COLUMN IF NOT EXISTS "capacity"     INTEGER;
ALTER TABLE "Waitlist"        ADD COLUMN IF NOT EXISTS "cancelReason" TEXT;
COMMIT;
