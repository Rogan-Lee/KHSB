// 사이드바 숫자가 바뀔 때 "새로 들어왔어요" 알림창을 띄울 메뉴 — 학생·학부모·방문자가 넣는 요청·신청 전부.
// 운영진 앱 푸시는 서버 queueStaffAlert 가 같은 건마다 따로 보낸다.
export const NEW_ITEM_TOASTS = [
  ["/waitlist", "입회 대기 신청·문의"],
  ["/instructions", "학부모 요청"],
  ["/questions", "학생 질문"],
  ["/suggestions", "학생 건의사항"],
  ["/approvals", "쪽잠·네트워크 신청"],
  ["/merit-demerit", "상점 교환 신청"],
  ["/exams", "모의고사 신청"],
  ["/lunch", "도시락 변경 요청·입금 알림"],
  ["/tuition", "현장 결제 신청"],
  ["/online/inbox", "학생 메시지"],
  ["/family-chat", "가족 톡방 새 글"],
  ["/online/schedules", "등원 스케줄 제출·수정 요청"],
  ["/online/performance", "수행평가 제출"],
  ["/students", "초기 설문 제출"],
  ["/online/reports", "리포트 학부모 피드백"],
  ["/moderation", "신고·차단"],
] as const;

type Badges = Record<string, number> | undefined;

/**
 * 직전·지금 배지(sidebar-badges.ts)를 비교해 알릴 새 건을 고른다.
 * 새 건 판단은 "newest:<href>"(가장 최근 건 시각)이 앞으로 갔는지로 한다 — 숫자 차이만 보면
 * 같은 사이 한 건 처리·한 건 도착이 상쇄돼 빠진다. 숫자 차이는 몇 건인지 표시에만 쓴다.
 */
export function findNewItems(prev: Badges, next: Badges, visible: Set<string>) {
  return NEW_ITEM_TOASTS.flatMap(([href, label]) => {
    if (!visible.has(href)) return [];
    const newest = next?.[`newest:${href}`] ?? 0;
    if (newest <= (prev?.[`newest:${href}`] ?? 0)) return [];
    return [{ href, label, added: Math.max(1, (next?.[href] ?? 0) - (prev?.[href] ?? 0)) }];
  });
}
