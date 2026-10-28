-- 현금영수증 결제선생 발급 (2026-10-28) — TuitionCashReceipt 에 결제사 발급 번호 컬럼 하나 추가. 추가 전용, 다시 실행해도 안전(멱등).
-- 결제선생 API 로 발급한 영수증의 billId 를 남겨 두고, 취소·결과 확인에 쓴다 (홈택스로 직접 발급한 건은 비어 있다).
-- 적용: Supabase SQL 편집기에서 실행
-- 순서: 이 SQL 을 먼저 실행한 뒤 코드를 배포한다 (컬럼이 없으면 /tuition 조회가 실패한다).

ALTER TABLE "TuitionCashReceipt" ADD COLUMN IF NOT EXISTS "providerBillId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "TuitionCashReceipt_providerBillId_key" ON "TuitionCashReceipt"("providerBillId");
