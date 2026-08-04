// 시간 자유 입력 파싱: "9"→"09:00", "930"→"09:30", "1430"→"14:30", "9:5"→"09:05"
// 빈 문자열 → "" (지우기 허용), 해석 불가/범위 초과 → null (호출부에서 이전 값 유지)
export function parseTimeText(raw: string): string | null {
  const s = raw.trim();
  if (!s) return "";
  let h: number;
  let m: number;
  const colon = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (colon) {
    h = Number(colon[1]);
    m = Number(colon[2]);
  } else if (/^\d{1,4}$/.test(s)) {
    if (s.length <= 2) {
      h = Number(s);
      m = 0;
    } else {
      h = Number(s.slice(0, -2));
      m = Number(s.slice(-2));
    }
  } else {
    return null;
  }
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// minHour보다 이른 시(時)는 minHour로 끌어올림 (분은 유지)
export function clampToMinHour(hhmm: string, minHour?: number): string {
  if (!hhmm || !minHour || minHour <= 0) return hhmm;
  const h = Number(hhmm.slice(0, 2));
  return h < minHour ? `${String(minHour).padStart(2, "0")}:${hhmm.slice(3)}` : hhmm;
}
