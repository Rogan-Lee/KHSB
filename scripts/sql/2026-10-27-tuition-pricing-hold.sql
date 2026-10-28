-- 수강료 산식·보류 (2026-10-27) — 컬럼 두 개 추가. 추가 전용, 다시 실행해도 안전(멱등).
--  · TuitionSetting.pricing : 반별 수강료·일할 기준(설정 탭 "수강료 산식"). 비어 있으면 코드 기본값(정규 55만·선택 41만 …)
--  · TuitionProfile.holdReason : 학생별 보류 사유. 적혀 있으면 자동 청구하지 않고 청구 일정에 "확인 필요"로 올린다
-- 적용: Supabase SQL 편집기에서 실행
-- 순서: 이 SQL 을 먼저 실행한 뒤 코드를 배포한다 (컬럼이 없으면 /tuition 조회와 자동 청구가 실패한다).

ALTER TABLE "TuitionSetting" ADD COLUMN IF NOT EXISTS "pricing" JSONB;
ALTER TABLE "TuitionProfile" ADD COLUMN IF NOT EXISTS "holdReason" TEXT;
