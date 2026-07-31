-- 2026-07-15 온라인 등원 스케줄 실행 예정일 예약 (반영 단계로 이동)
-- ScheduleProposal.scheduledFor 추가 + 이전 직접편집용 예약 테이블 폐기(데이터 없음)
BEGIN;

ALTER TABLE "ScheduleProposal" ADD COLUMN IF NOT EXISTS "scheduledFor" DATE;

DROP TABLE IF EXISTS "ScheduledScheduleChange";

COMMIT;
