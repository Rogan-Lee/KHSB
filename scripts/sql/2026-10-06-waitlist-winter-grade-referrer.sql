-- 대기 신청: 윈터 시즌 예비 학년 · 추천인 (2026-10-06)
-- additive: nullable 컬럼 2개 추가. 기존 데이터·컬럼 변경 없음.
-- 적용: Supabase SQL 편집기에서 실행 (또는 psql "$DIRECT_URL" -f scripts/sql/2026-10-06-waitlist-winter-grade-referrer.sql)
-- 순서: 이 SQL 을 먼저 실행한 뒤 코드를 배포한다 (컬럼이 없으면 대기자 조회·신청이 실패한다).

ALTER TABLE "Waitlist" ADD COLUMN IF NOT EXISTS "winterGrade" TEXT;
ALTER TABLE "Waitlist" ADD COLUMN IF NOT EXISTS "referrerName" TEXT;
