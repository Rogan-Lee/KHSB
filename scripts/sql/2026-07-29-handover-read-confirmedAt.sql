-- 인수인계 열람로그: "봤음(readAt)" 과 "확인함(confirmedAt)" 분리
-- readAt      = 최초 열람(상세 페이지를 처음 연 시점)
-- confirmedAt = 명시적 "확인" 클릭 시각 (null = 봤지만 미확인)
--
-- ⚠️ additive only. 배포 시 수동 적용 (db:push 금지).

ALTER TABLE "HandoverRead" ADD COLUMN "confirmedAt" TIMESTAMP(3);

-- 기존 행은 전부 "확인" 버튼을 눌러서 생긴 행이므로 확인완료로 보정한다.
UPDATE "HandoverRead" SET "confirmedAt" = "readAt" WHERE "confirmedAt" IS NULL;
