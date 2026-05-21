// 순찰 좌석 QR 페이로드 인코딩/디코딩.
// 좌석 스티커 QR 에는 `KHSB-STU:<studentId>` 형태로 학생 id 를 담는다.
// 임의의 QR 을 스캔했을 때 학생 식별 실패를 명확히 구분하기 위해 prefix 를 둔다.

export const PATROL_QR_PREFIX = "KHSB-STU:";

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
