/**
 * 만료 회수 대상 선별 — 순수 함수 (크론 라우트 + 테스트에서 공용).
 * 대상: 어댑터로 적용됨(appliedAt != null) && 사용 종료 시각(endAt)이 지남.
 * status=APPROVED 필터는 DB 쿼리 단에서 처리한다.
 */
export function selectExpiredNetworkRequests<
  T extends { endAt: Date; appliedAt: Date | null },
>(requests: T[], now: Date): T[] {
  return requests.filter((r) => r.appliedAt !== null && r.endAt < now);
}
