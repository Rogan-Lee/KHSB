import { color, type Tone } from '@/design';
import type { AttendanceStatus, AttendanceTypeCode, OpsAttendanceItem } from '@/lib/api/staff-ops';

/** 화면 표시 이름 — 서버 '입실'(지금 자리에 있음)은 '재실'로 보여 준다 */
export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  입실: '재실',
  외출: '외출',
  퇴실: '퇴실',
  미입실: '미입실',
  결석: '결석',
};

export const STATUS_TONE: Record<AttendanceStatus, Tone> = {
  입실: 'ok',
  외출: 'warn',
  퇴실: 'gray',
  미입실: 'gray',
  결석: 'bad',
};

/** 좌석 타일 색 (좌석 현황·목록 좌석 칸) */
export const SEAT_FILL: Record<AttendanceStatus, { bg: string; fg: string; border: string }> = {
  입실: { bg: color.bg.positiveWeak, fg: color.fg.positive, border: color.stroke.positiveWeak },
  외출: { bg: color.bg.warningWeak, fg: color.fg.warning, border: color.stroke.warningWeak },
  미입실: { bg: color.bg.neutralWeak, fg: color.fg.neutralMuted, border: color.stroke.neutralWeak },
  결석: { bg: color.bg.criticalWeak, fg: color.fg.critical, border: color.stroke.criticalWeak },
  퇴실: { bg: color.bg.layerDefault, fg: color.fg.neutralSubtle, border: color.stroke.neutralWeak },
};

export const ATTENDANCE_TYPE_OPTIONS: { value: Exclude<AttendanceTypeCode, 'EARLY_LEAVE'>; label: string }[] =
  [
    { value: 'NORMAL', label: '정상' },
    { value: 'TARDY', label: '지각' },
    { value: 'ABSENT', label: '결석' },
    { value: 'APPROVED_ABSENT', label: '공결' },
    { value: 'NOTIFIED_ABSENT', label: '미입실' },
  ];

export const ATTENDANCE_TYPE_TONE: Record<AttendanceTypeCode, Tone> = {
  NORMAL: 'ok',
  EARLY_LEAVE: 'ok',
  TARDY: 'warn',
  ABSENT: 'bad',
  NOTIFIED_ABSENT: 'violet',
  APPROVED_ABSENT: 'gray',
};

/** 목록 행 설명 줄 — "입실 09:12 · 예정 09:00–22:00" */
export function attendanceLine(item: OpsAttendanceItem): string {
  const sched = item.scheduleStart
    ? `예정 ${item.scheduleStart}${item.scheduleEnd ? `–${item.scheduleEnd}` : ''}`
    : '오늘 예정 없음';
  switch (item.status) {
    case '입실':
      return [
        `입실 ${item.checkIn ?? item.time ?? '—'}`,
        item.attendanceType === 'TARDY' ? '지각' : null,
        sched,
      ]
        .filter(Boolean)
        .join(' · ');
    case '외출': {
      const active = item.outings.find((o) => o.status === '외출중');
      return [`외출 ${item.time ?? active?.start ?? ''}~`, active?.reason].filter(Boolean).join(' · ');
    }
    case '퇴실':
      return `${item.checkIn ?? '—'}–${item.checkOut ?? item.time ?? '—'} 퇴실`;
    case '결석':
      return ['결석 처리', sched].join(' · ');
    default:
      return `미입실 · ${sched}`;
  }
}

/** 오늘 행동해야 하는 학생인지 — 늦었거나, 유의거나, 확인 안 한 요청 */
export function needsAttention(item: OpsAttendanceItem) {
  return item.isLate || !!item.attention || item.unreadRequests > 0;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** "2026-09-25" → "9월 25일 (목)" */
export function formatDateKey(key: string, withWeekday = true) {
  const [y, m, d] = key.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}월 ${d}일${withWeekday ? ` (${WEEKDAYS[wd]})` : ''}`;
}

/** "2026-09-25" → "9/25" */
export function formatShortDateKey(key: string) {
  const [, m, d] = key.split('-').map(Number);
  return `${m}/${d}`;
}

export function weekdayLabel(n: number) {
  return WEEKDAYS[n] ?? '';
}

/** KST 오늘 "YYYY-MM-DD" */
export function todayKstKey(now = new Date()) {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" ± n일 */
export function shiftDateKey(key: string, days: number) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** 시간 입력 마스크: 숫자만 받아 "HH:MM" 로 */
export function maskTime(raw: string) {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

export function isValidTime(v: string) {
  if (!/^\d{2}:\d{2}$/.test(v)) return false;
  const [h, m] = v.split(':').map(Number);
  return h <= 23 && m <= 59;
}

/** 좌석 번호 숫자 정렬 (서버 compareSeat 와 동일) */
export function compareSeat(
  a: { seat: string | null; name: string },
  b: { seat: string | null; name: string }
) {
  return (
    (a.seat ?? '').localeCompare(b.seat ?? '', 'ko', { numeric: true }) || a.name.localeCompare(b.name, 'ko')
  );
}

/** 이름·좌석·학교·학년 검색 */
export function matchesStudent(
  s: { name: string; seat: string | null; school?: string | null; grade: string },
  query: string
) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const seat = s.seat?.trim().toLowerCase() ?? '';
  return (
    s.name.toLowerCase().includes(q) ||
    (seat !== '' && seat.startsWith(q)) ||
    (s.school ?? '').toLowerCase().includes(q) ||
    s.grade.toLowerCase().includes(q)
  );
}
