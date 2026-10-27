// 랜딩 홈 공지 팝업 — 어드민 콘텐츠 > '홈페이지 팝업'에서 쓰고, 공개 API 가 랜딩에 내려준다.
// AppSetting 에 JSON 으로 저장(내용에 계좌번호 등이 들어가므로 코드 · 공개 저장소에는 두지 않는다).
// 클라이언트 컴포넌트에서도 import 하므로 서버 전용 모듈을 참조하지 말 것.

export const LANDING_POPUP_KEY = "landing.popup";

export type LandingPopup = {
  active: boolean;
  title: string;
  /** markdown */
  body: string;
  /** "YYYY-MM-DD" (KST) — 이 날까지 보이고 다음 날 자동으로 내려간다. null 이면 끌 때까지 */
  until: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  /** 저장 시각(ISO) — 랜딩 '오늘 하루 보지 않기'의 키. 내용을 바꾸면 다시 뜬다 */
  updatedAt: string;
};

const str = (v: unknown) => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown) => (typeof v === "string" && v ? v : null);

export function parseLandingPopup(value: string | null | undefined): LandingPopup | null {
  try {
    const o = JSON.parse(value ?? "");
    if (!o || typeof o !== "object") return null;
    return {
      active: o.active === true,
      title: str(o.title),
      body: str(o.body),
      until: strOrNull(o.until),
      ctaLabel: strOrNull(o.ctaLabel),
      ctaUrl: strOrNull(o.ctaUrl),
      updatedAt: str(o.updatedAt),
    };
  } catch {
    return null;
  }
}

/** 지금 랜딩에 떠야 하는지 — today 는 KST "YYYY-MM-DD" */
export function isLandingPopupLive(p: LandingPopup | null, today: string): boolean {
  return !!p && p.active && !!p.title && !!p.body && (!p.until || today <= p.until);
}
