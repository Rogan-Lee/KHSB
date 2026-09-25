import type { Href } from 'expo-router';

// 직원 현장 운영 화면 경로 — 항상 (staff) 그룹 접두사 포함.
// 타입 라우트(.expo/types)는 dev 서버가 다시 만들 때까지 새 경로를 모르므로 여기서 한 번만 Href 로 맞춘다.
export const staffOpsRoutes = {
  students: '/(staff)/students' as Href,
  student: (id: string, tab?: string) =>
    (tab ? `/(staff)/students/${id}?tab=${tab}` : `/(staff)/students/${id}`) as Href,
  /** 포털 링크 보내기 — T3 영역 화면 */
  portalLink: (id: string) => `/(staff)/students/${id}/portal-link` as Href,
  phoneCheck: '/(staff)/phone-check' as Href,
  seatMap: '/(staff)/seat-map' as Href,
};
