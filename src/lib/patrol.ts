// 순찰 좌석 QR 페이로드 인코딩/디코딩.
// 좌석 스티커 QR 에는 `KHSB-STU:<studentId>` 형태로 학생 id 를 담는다.
// 임의의 QR 을 스캔했을 때 학생 식별 실패를 명확히 구분하기 위해 prefix 를 둔다.

export const PATROL_QR_PREFIX = "KHSB-STU:";

/**
 * 좌석 번호 정렬 비교기 — 숫자 인식(numeric)이라 "2" < "10" 이 올바로 정렬된다.
 * (DB orderBy 는 문자열 정렬이라 "10" < "2" 가 되므로 fetch 후 이걸로 재정렬할 것)
 */
export function compareSeat(
  a: { seat: string | null; name: string },
  b: { seat: string | null; name: string },
): number {
  return (
    (a.seat ?? "").localeCompare(b.seat ?? "", "ko", { numeric: true }) ||
    a.name.localeCompare(b.name, "ko")
  );
}

/**
 * 좌석 문자열 → 룸 그룹 이름.
 * KHSB 좌석은 숫자 문자열 — 배치도(seat-map-board.tsx) 기준 K룸 1–53·87–89, H룸 54–86.
 * "A-12" 같은 접두형은 접두("A")를, 그 외 비어있지 않은 값은 "기타"를 반환.
 */
// ponytail: 배치도 범위 하드코딩 — Room 모델/구역 설정이 생기면 그쪽 파생으로 교체
export function seatRoom(seat: string | null | undefined): string | null {
  const s = seat?.trim();
  if (!s) return null;
  const n = Number(s);
  if (Number.isInteger(n)) {
    if ((n >= 1 && n <= 53) || (n >= 87 && n <= 89)) return "K룸";
    if (n >= 54 && n <= 86) return "H룸";
    return "기타";
  }
  const prefix = s.match(/^([A-Za-z가-힣]+)[-\s]/)?.[1];
  return prefix ?? "기타";
}

/** 입퇴실 시간 표시 텍스트: "10:02 입실" / 퇴실 시 "10:02~18:30". 입실 정보 없으면 null. */
export function formatAttendanceSpan(checkInAt: string | null, checkOutAt: string | null): string | null {
  if (!checkInAt) return null;
  return checkOutAt ? `${checkInAt}~${checkOutAt}` : `${checkInAt} 입실`;
}

/** 순찰 특이사항 자주 쓰는 유형 — 칩 탭으로 note 에 append. */
// ponytail: 하드코딩 상수 — 시설별 커스텀 니즈 생기면 AppSetting(patrol.notePresets)으로 승격
export const PATROL_NOTE_PRESETS = [
  "졸음",
  "휴대폰 사용",
  "자리 이탈",
  "잡담/소음",
  "취식",
  "이어폰 사용",
] as const;

/** 학생 id → 좌석 QR 페이로드 문자열. */
export function encodeStudentQr(studentId: string): string {
  return `${PATROL_QR_PREFIX}${studentId}`;
}

/**
 * 스캔한 QR 페이로드에서 학생 id 추출.
 * prefix 가 없거나 id 가 비면 null (= 우리 시스템 QR 아님).
 */
export function decodeStudentQr(payload: string | null | undefined): string | null {
  if (!payload) return null;
  const trimmed = payload.trim();
  if (!trimmed.startsWith(PATROL_QR_PREFIX)) return null;
  const id = trimmed.slice(PATROL_QR_PREFIX.length).trim();
  return id || null;
}
