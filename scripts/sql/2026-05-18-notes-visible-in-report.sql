-- Sprint 1 PR 1.4 — MeritDemerit/MonthlyNote.visibleInReport 컬럼 추가
-- Migration safety: default true → 기존 데이터 동작 보존, 백필 불필요.
ALTER TABLE "MeritDemerit" ADD COLUMN IF NOT EXISTS "visibleInReport" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "MonthlyNote"  ADD COLUMN IF NOT EXISTS "visibleInReport" BOOLEAN NOT NULL DEFAULT true;
