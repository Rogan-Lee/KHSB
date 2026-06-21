// 링크 공유 시 함께 나가는 안내 문구 템플릿 (운영진 커스텀 가능, AppSetting 저장).
// 플레이스홀더: {count} = 링크 수, {links} = 링크 목록(줄바꿈), {name} = 학생 이름, {url} = 단일 링크.

export const SHARE_WORDING_KEYS = {
  PARENT_REPORT: "share_wording.parent_report",
  CONSULTATION: "share_wording.consultation",
  SCHEDULE: "share_wording.schedule",
} as const;

export type ShareWordingKey = (typeof SHARE_WORDING_KEYS)[keyof typeof SHARE_WORDING_KEYS];

export const SHARE_WORDING_DEFAULTS: Record<ShareWordingKey, string> = {
  [SHARE_WORDING_KEYS.PARENT_REPORT]:
    "안녕하세요, 학부모님. 이번 학습 리포트를 공유드립니다.\n\n{links}\n\n링크를 눌러 확인해 주세요. 감사합니다.",
  [SHARE_WORDING_KEYS.CONSULTATION]:
    "안녕하세요, 학부모님. 상담 안내 자료를 보내드립니다.\n\n{url}",
  [SHARE_WORDING_KEYS.SCHEDULE]:
    "안녕하세요, 학부모님. 다음 주 등원 스케줄(안)을 보내드립니다. 확인 후 승인 부탁드립니다.\n\n{url}",
};

/** 템플릿에 값 치환. 누락 플레이스홀더는 빈 문자열 처리. */
export function renderShareWording(
  template: string,
  vars: { count?: number; links?: string; name?: string; url?: string },
): string {
  return template
    .replace(/\{count\}/g, vars.count != null ? String(vars.count) : "")
    .replace(/\{links\}/g, vars.links ?? "")
    .replace(/\{name\}/g, vars.name ?? "")
    .replace(/\{url\}/g, vars.url ?? "");
}
