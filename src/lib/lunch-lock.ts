import { toKSTDateTime } from "@/lib/utils";

/**
 * 도시락 주간 신청 마감(Lock).
 *
 * 규칙: 메뉴 날짜(D)가 속한 주(월~일)의 신청/수정은 **그 전주 목요일 23:59(KST)**에 잠긴다.
 * 예) 7/27(월)~8/2(일) 주는 7/23(목) 23:59부터 신청/변경 불가.
 *
 * DB에 잠금 상태를 저장하지 않고 (메뉴 날짜, 현재 시각)만으로 계산한다.
 * → 크론/컬럼 없이 동작하고, 크론 미실행으로 잠금이 새는 실패 모드가 없다.
 */
export function lunchLockDeadline(menuDate: Date): Date {
  // menuDate = KST 달력일의 UTC 자정(@db.Date). UTC 메서드로 KST 달력 요일을 읽는다.
  const dow = menuDate.getUTCDay(); // 0=일 … 4=목
  const mondayOffset = (dow + 6) % 7; // 그 주 월요일까지 뒤로
  const thu = new Date(menuDate);
  thu.setUTCDate(thu.getUTCDate() - mondayOffset - 4); // 월요일 -4일 = 전주 목요일
  return toKSTDateTime(thu.toISOString().slice(0, 10), "23:59");
}

/** menuDate 가 속한 주가 이미 신청 마감되었는지. */
export function isLunchLocked(menuDate: Date, now: Date = new Date()): boolean {
  return now >= lunchLockDeadline(menuDate);
}
