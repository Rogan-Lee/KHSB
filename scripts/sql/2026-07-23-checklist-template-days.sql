-- 2026-07-23 루틴 체크리스트 템플릿에 요일 필터 추가
-- ChecklistTemplate.days: CSV of DOW ints "0,1,2" (0=일..6=토). 빈 문자열 = 매일
BEGIN;

ALTER TABLE "ChecklistTemplate" ADD COLUMN IF NOT EXISTS "days" TEXT NOT NULL DEFAULT '';

COMMIT;
