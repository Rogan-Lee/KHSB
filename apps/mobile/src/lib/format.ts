export function formatKoreanDay(date = new Date()) {
  return date.toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
}

export function formatKoreanDateTime(value: string) {
  return new Date(value).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatShortDateTime(value: string) {
  return new Date(value).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatRelativeTime(value: string, now = new Date()) {
  const elapsedMinutes = Math.max(
    0,
    Math.floor((now.getTime() - new Date(value).getTime()) / 60000),
  );

  if (elapsedMinutes < 1) return '방금 전';
  if (elapsedMinutes < 60) return `${elapsedMinutes}분 전`;
  if (elapsedMinutes < 24 * 60) return `${Math.floor(elapsedMinutes / 60)}시간 전`;
  if (elapsedMinutes < 7 * 24 * 60) return `${Math.floor(elapsedMinutes / 1440)}일 전`;
  return formatShortDateTime(value);
}

export function formatDueDate(value: string) {
  const due = new Date(value);
  const today = new Date();
  const dueKey = due.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  const todayKey = today.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });

  if (dueKey === todayKey) return '오늘 마감';
  return due.toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
  });
}
