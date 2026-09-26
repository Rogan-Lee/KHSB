// 포털 첨부(질문·채팅·수행평가 제출/피드백) 메타 정규화 — 서버 액션 공용.
// 클라이언트가 보낸 첨부 객체를 그대로 JSON 컬럼에 저장하지 않고, 알려진 필드만 길이 제한해 남긴다.
// URL 은 https:// 절대 주소만 허용한다 — 업로더(Vercel Blob)는 항상 https 주소를 돌려주고, 모바일도 같은 기준
// (javascript:/data:/http:/상대 경로 차단 — 다른 사용자 화면의 href/src 로 렌더되므로).

export type PortalAttachment = {
  url: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
};

const MAX_URL_LEN = 2000;
const MAX_NAME_LEN = 200;
const MAX_MIME_LEN = 120;

export function isSafeAttachmentUrl(url: unknown): url is string {
  if (typeof url !== "string" || url.length === 0 || url.length > MAX_URL_LEN) return false;
  return url.startsWith("https://");
}

/** 안전하지 않은 항목은 버리고 최대 max 개까지 정규화. 배열이 아니면 빈 배열. */
export function sanitizePortalAttachments(input: unknown, max: number): PortalAttachment[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter(
      (a): a is Record<string, unknown> =>
        !!a && typeof a === "object" && isSafeAttachmentUrl((a as { url?: unknown }).url)
    )
    .slice(0, max)
    .map((a) => ({
      url: a.url as string,
      name:
        typeof a.name === "string" && a.name.trim()
          ? a.name.slice(0, MAX_NAME_LEN)
          : "첨부",
      sizeBytes:
        typeof a.sizeBytes === "number" && Number.isFinite(a.sizeBytes) && a.sizeBytes >= 0
          ? Math.round(a.sizeBytes)
          : 0,
      mimeType:
        typeof a.mimeType === "string" && a.mimeType.trim()
          ? a.mimeType.slice(0, MAX_MIME_LEN)
          : "application/octet-stream",
    }));
}
