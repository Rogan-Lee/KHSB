-- 휴대폰 검사 교시별 체크 (2026-11-14) — PhoneCheckRecord 에 교시(period) 열 추가. 다시 실행해도 안전(멱등).
-- period 0 = 기존 "입실 때" 검사(지금까지의 기록 전부), 1~ = 교시.
-- 적용: Supabase SQL 편집기(운영 vrdz)에서 두 단계로 실행

-- ① 코드 배포 전에 실행 — 열과 새 유니크 인덱스만 추가. 옛 코드(학생·날짜당 1건)는 그대로 돈다.
ALTER TABLE "PhoneCheckRecord" ADD COLUMN IF NOT EXISTS "period" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS "PhoneCheckRecord_studentId_date_period_key" ON "PhoneCheckRecord"("studentId", "date", "period");

-- ② 새 코드 배포를 확인한 뒤 실행 — 옛 유니크(학생·날짜)를 지워야 교시별로 여러 건을 저장할 수 있다.
-- DROP INDEX IF EXISTS "PhoneCheckRecord_studentId_date_key";
