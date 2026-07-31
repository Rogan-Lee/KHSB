-- 2026-07-24 루틴 일별 완료 기록 테이블
-- (templateId, date) 당 1행. 행이 있으면 그날 완료, 없으면 미완료(매일 리셋).
BEGIN;

CREATE TABLE IF NOT EXISTS "RoutineCompletion" (
  "id" TEXT PRIMARY KEY,
  "templateId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "checkedById" TEXT,
  "checkedByName" TEXT,
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "RoutineCompletion_templateId_date_key" ON "RoutineCompletion"("templateId", "date");
CREATE INDEX IF NOT EXISTS "RoutineCompletion_date_idx" ON "RoutineCompletion"("date");

COMMIT;
