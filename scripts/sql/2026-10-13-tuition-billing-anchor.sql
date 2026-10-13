-- 수강료 결제 기준일 (2026-10-13) — TuitionProfile 에 날짜 컬럼 하나 추가. 추가 전용, 다시 실행해도 안전(멱등).
-- 학생마다 결제일이 달라서, 다음 청구의 이용 시작일을 학생별로 등록해 둔다 (비워 두면 지금처럼 등록일 기준).
-- 적용: Supabase SQL 편집기에서 실행
-- 순서: 이 SQL 을 먼저 실행한 뒤 코드를 배포한다 (컬럼이 없으면 /tuition 조회와 자동 청구가 실패한다).

ALTER TABLE "TuitionProfile" ADD COLUMN IF NOT EXISTS "billingAnchor" DATE;
