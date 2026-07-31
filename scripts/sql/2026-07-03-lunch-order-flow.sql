-- 2026-07-03 도시락 학부모 흐름 — 입금알림/변경요청 컬럼 (추가 전용, 멱등)
BEGIN;
ALTER TABLE "LunchOrder" ADD COLUMN IF NOT EXISTS "depositClaimedAt"  TIMESTAMP(3);
ALTER TABLE "LunchOrder" ADD COLUMN IF NOT EXISTS "changeRequest"     TEXT;
ALTER TABLE "LunchOrder" ADD COLUMN IF NOT EXISTS "changeRequestedAt" TIMESTAMP(3);
COMMIT;
