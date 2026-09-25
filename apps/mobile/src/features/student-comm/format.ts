// 질문·메시지 화면용 KST 시각 표기 — 웹 학생 포털(qna/page.tsx, chat/page.tsx, chat-view.tsx,
// question-thread.tsx)과 같은 문구. 기기 시간대와 무관하게 항상 한국 시간으로 계산한다.

const KST_OFFSET = 9 * 60 * 60 * 1000;

/** UTC 필드로 읽으면 KST 벽시계가 되는 Date */
function kst(value: string | number | Date): Date {
  return new Date(new Date(value).getTime() + KST_OFFSET);
}

function sameDay(a: Date, b: Date) {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/** "오전 9:05" */
export function formatClock(value: string | number | Date): string {
  const k = kst(value);
  const h = k.getUTCHours();
  const m = k.getUTCMinutes().toString().padStart(2, '0');
  return `${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${m}`;
}

/** 질문 목록 시각 — 오늘이면 시각, 올해면 "3월 5일", 그 외 "2025. 3. 5." */
export function formatListWhen(iso: string): string {
  const k = kst(iso);
  const now = kst(Date.now());
  if (sameDay(k, now)) return formatClock(iso);
  if (k.getUTCFullYear() === now.getUTCFullYear()) {
    return `${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일`;
  }
  return `${k.getUTCFullYear()}. ${k.getUTCMonth() + 1}. ${k.getUTCDate()}.`;
}

/** 채팅 목록 시각 — "방금", "5분 전", "3시간 전", "2일 전", 그 외 "3/5" */
export function formatAgo(iso: string | null): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (diff < 60_000) return '방금';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}일 전`;
  const k = kst(t);
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()}`;
}

/** 질문 상세 등록 시각 — "3월 5일 오후 2:10" */
export function formatAsked(iso: string): string {
  const k = kst(iso);
  return `${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일 ${formatClock(iso)}`;
}

/** 질문 스레드 말풍선 시각 — 오늘이면 시각만, 아니면 "3월 5일 오후 2:10" */
export function formatBubbleTime(iso: string): string {
  const k = kst(iso);
  const now = kst(Date.now());
  return sameDay(k, now) ? formatClock(iso) : formatAsked(iso);
}

/** 채팅 날짜 구분선 키 (KST 날짜) */
export function dayKey(iso: string): string {
  const k = kst(iso);
  return `${k.getUTCFullYear()}-${k.getUTCMonth()}-${k.getUTCDate()}`;
}

/** 채팅 날짜 구분선 — "오늘", "어제", "3월 5일", "2025. 3. 5" */
export function dayLabel(iso: string): string {
  const d = kst(iso);
  const now = kst(Date.now());
  if (sameDay(d, now)) return '오늘';
  if (sameDay(d, new Date(now.getTime() - 86_400_000))) return '어제';
  if (d.getUTCFullYear() === now.getUTCFullYear()) {
    return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
  }
  return `${d.getUTCFullYear()}. ${d.getUTCMonth() + 1}. ${d.getUTCDate()}`;
}

/** 파일 크기 "1.2MB" / "320KB" */
export function formatBytes(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
