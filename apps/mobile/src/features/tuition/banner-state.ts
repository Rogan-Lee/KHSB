// 홈 수강료 배너 "닫기" 상태 — 순수 함수만 둔다.
// RN·Expo·'@/' 별칭을 import 하지 않는다: 루트 vitest 가 상대 경로로 가져다 테스트한다
// (src/lib/__tests__/mobile-tuition-banner.test.ts). 저장은 banner-store.ts 가 맡는다.

export type BannerLike = { invoiceId: string; overdue: boolean };

/** 닫은 배너 키를 이만큼만 기억한다 (SecureStore 값 크기 제한 + 오래된 청구서는 다시 뜰 일이 없음) */
export const MAX_DISMISSED = 20;

/**
 * 닫은 배너를 구분하는 키. 청구서 id 에 상태를 붙여서,
 * 결제 요청 배너를 닫았더라도 미납이 되면 다시 보이고 새 청구서는 항상 보인다.
 */
export function bannerKey(banner: BannerLike): string {
  return `${banner.invoiceId}:${banner.overdue ? 'OVERDUE' : 'REQUESTED'}`;
}

export function shouldShowBanner(
  banner: BannerLike | null | undefined,
  dismissedKeys: readonly string[],
): boolean {
  if (!banner || !banner.invoiceId) return false;
  return !dismissedKeys.includes(bannerKey(banner));
}

/** 닫은 키를 맨 뒤(가장 최근)에 넣고, 오래된 것부터 버려 max 개만 남긴다 */
export function addDismissed(keys: readonly string[], key: string, max = MAX_DISMISSED): string[] {
  const next = [...keys.filter((k) => k !== key), key];
  return next.length > max ? next.slice(next.length - max) : next;
}

/** 저장소에서 읽은 문자열 → 키 목록. 깨진 값은 빈 목록으로 본다 (배너가 한 번 더 보일 뿐) */
export function parseDismissed(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === 'string').slice(-MAX_DISMISSED);
  } catch {
    return [];
  }
}
