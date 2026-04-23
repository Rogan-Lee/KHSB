// 사진 파일명 파싱 / 중복 처리 유틸
// 표준 포맷: YYYYMMDD_좌석번호_이름.확장자 (예: 20260421_15_김철수.jpg)

const ALLOWED_EXTS = ["jpg", "jpeg", "png", "heic", "heif", "webp"] as const;
export const ALLOWED_EXT_REGEX = /\.(jpe?g|png|heic|heif|webp)$/i;
export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
];

export type ParsedFilename = {
  valid: boolean;
  date?: Date;
  seatNumber?: number;
  name?: string;
  ext?: string;
  reason?: string;
};

function parseYYYYMMDD(s: string): Date | null {
  if (!/^\d{8}$/.test(s)) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6));
  const d = Number(s.slice(6, 8));
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

export function parsePhotoFileName(fileName: string): ParsedFilename {
  const m = fileName.match(/^(\d{8})_(\d{1,3})_(.+)\.([a-z0-9]+)$/i);
  if (!m) return { valid: false, reason: "포맷 오류 (예: 20260421_15_김철수.jpg)" };
  const [, dateStr, seatStr, name, ext] = m;

  const date = parseYYYYMMDD(dateStr);
  if (!date) return { valid: false, reason: `날짜 파싱 실패: ${dateStr}` };

  const seat = Number(seatStr);
  if (!Number.isInteger(seat) || seat < 1 || seat > 200) {
    return { valid: false, reason: `좌석번호 범위 초과: ${seat}` };
  }

  const extLower = ext.toLowerCase();
  if (!(ALLOWED_EXTS as readonly string[]).includes(extLower)) {
    return { valid: false, reason: `지원 안 하는 확장자: ${ext}` };
  }

  return { valid: true, date, seatNumber: seat, name: name.trim(), ext: extLower };
}

/**
 * 중복 파일명 처리 — 동일 이름이 존재하면 `" (1)"`, `" (2)"` 접미사.
 * existingNames 에 이미 들어간 이름이 있으면 다음 번호 찾기.
 */
export function makeUniqueFileName(base: string, existingNames: Set<string>): string {
  if (!existingNames.has(base)) return base;
  const dot = base.lastIndexOf(".");
  const name = dot >= 0 ? base.slice(0, dot) : base;
  const ext = dot >= 0 ? base.slice(dot) : "";
  let i = 1;
  while (existingNames.has(`${name} (${i})${ext}`)) i++;
  return `${name} (${i})${ext}`;
}
