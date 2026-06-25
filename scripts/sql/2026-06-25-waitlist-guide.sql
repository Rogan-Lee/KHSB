-- 2026-06-25 대기자 등록 안내 링크 — guideContent/guideToken (추가 전용, 멱등)
-- 적용: psql "<PROD_DIRECT_URL>" -f scripts/sql/2026-06-25-waitlist-guide.sql
BEGIN;
ALTER TABLE "Waitlist" ADD COLUMN IF NOT EXISTS "guideContent" TEXT;
ALTER TABLE "Waitlist" ADD COLUMN IF NOT EXISTS "guideToken"   TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Waitlist_guideToken_key" ON "Waitlist"("guideToken");
COMMIT;
