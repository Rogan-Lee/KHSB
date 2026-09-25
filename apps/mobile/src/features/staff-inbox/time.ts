// 소통·승인함 시간 표기 (KST 기준)

const TZ = 'Asia/Seoul';

/** KST 날짜 키 YYYY-MM-DD */
export function kstDateKey(value: string | Date) {
  return new Date(value).toLocaleDateString('en-CA', { timeZone: TZ });
}

/**
 * 목록용 시각 — 방금 · n분 전 · 오늘이면 "14:05" · 어제 · 올해면 "9월 23일" · 그 외 "2025. 9. 23."
 */
export function formatInboxTime(value: string, now = new Date()) {
  const date = new Date(value);
  const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (diffMin < 1) return '방금';
  if (diffMin < 60) return `${diffMin}분 전`;
  const key = kstDateKey(date);
  if (key === kstDateKey(now)) {
    return date.toLocaleTimeString('ko-KR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
  }
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (key === kstDateKey(yesterday)) return '어제';
  if (key.slice(0, 4) === kstDateKey(now).slice(0, 4)) {
    return date.toLocaleDateString('ko-KR', { timeZone: TZ, month: 'long', day: 'numeric' });
  }
  return date.toLocaleDateString('ko-KR', { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric' });
}

/** 날짜만 있는 값(YYYY-MM-DD) — "10월 15일 (수)" · 오늘/내일은 앞에 표시 */
export function formatDateOnly(ymd: string, now = new Date()) {
  const date = new Date(`${ymd}T00:00:00Z`);
  const label = date.toLocaleDateString('ko-KR', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
  const today = kstDateKey(now);
  const tomorrow = kstDateKey(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  if (ymd === today) return `오늘 · ${label}`;
  if (ymd === tomorrow) return `내일 · ${label}`;
  return label;
}

/** 시각 범위 — 같은 날이면 "9월 25일 14:00 ~ 16:00", 다르면 양쪽 날짜 */
export function formatTimeRange(startIso: string, endIso: string) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const day = (d: Date) => d.toLocaleDateString('ko-KR', { timeZone: TZ, month: 'long', day: 'numeric' });
  const time = (d: Date) =>
    d.toLocaleTimeString('ko-KR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
  if (kstDateKey(start) === kstDateKey(end)) return `${day(start)} ${time(start)} ~ ${time(end)}`;
  return `${day(start)} ${time(start)} ~ ${day(end)} ${time(end)}`;
}

/** 처리 시각 — "9. 25. 14:02" */
export function formatDecidedAt(value: string) {
  return new Date(value).toLocaleString('ko-KR', {
    timeZone: TZ,
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatPoints(points: number) {
  return `${points.toLocaleString('ko-KR')}점`;
}
