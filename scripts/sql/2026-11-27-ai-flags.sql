-- 생성형 AI 결과물 표시(인공지능기본법 제31조): 글이 AI 초안에서 나왔는지 기록하는 칸 3개.
-- 운영 Supabase SQL 편집기에서 실행. 여러 번 실행해도 안전하다 (기존 행은 모두 false — 표시가 붙지 않는다).
-- 칸 추가라 RLS 정책에는 영향이 없다. 상수 기본값 칸 추가는 표를 다시 쓰지 않아 금방 끝난다.
-- 코드 배포 전에 먼저 실행한다 (새 코드가 이 칸을 읽고 쓴다).

ALTER TABLE "ParentReport" ADD COLUMN IF NOT EXISTS "customNoteAi" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MonthlyReport" ADD COLUMN IF NOT EXISTS "mentoringSummaryAi" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StudentInstruction" ADD COLUMN IF NOT EXISTS "aiDrafted" BOOLEAN NOT NULL DEFAULT false;

-- 확인 (3행이 나오면 끝):
-- SELECT table_name, column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_schema = 'public'
--    AND (table_name, column_name) IN (
--      ('ParentReport', 'customNoteAi'),
--      ('MonthlyReport', 'mentoringSummaryAi'),
--      ('StudentInstruction', 'aiDrafted')
--    );
