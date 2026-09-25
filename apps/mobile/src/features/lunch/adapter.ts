import type {
  LunchMenu,
  LunchOrderState,
  ParentLunchResponse,
} from '@/lib/api/parent-services';

// 도시락 신청 화면은 학부모·학생이 같이 쓴다. 역할별 차이(조회 경로·저장 함수·자녀 칩)는 어댑터로 넘긴다.

/** 서버 응답 — 학부모 /parent/lunch 와 학생 /student/lunch 가 같은 모양 */
export type LunchData = ParentLunchResponse;
export type { LunchMenu, LunchOrderState };

/** 화면 틀 설정 — 데이터가 없어도(자녀 미연결 등) 그릴 수 있는 부분 */
export type LunchFrameConfig = {
  /** 히스토리 없이 들어왔을 때 뒤로가기 목적지 */
  backFallback: string;
  /** 본문 위 자녀 칩 줄 (학부모 — 자녀가 둘 이상일 때만 그려짐) */
  childSwitcher: boolean;
};

export type LunchAdapter = LunchFrameConfig & {
  /** 신청 대상 식별 (자녀 id 등) — 바뀌면 선택·수정 상태를 새로 잡는다 */
  key: string;
  /** 학부모는 자녀 이름("홍길동 학생")을, 학생은 "내 도시락"을 머리글에 쓴다 */
  audience: 'parent' | 'student';
  saveOrder: (menuIds: string[], memo: string) => Promise<{ count: number }>;
  claimDeposit: () => Promise<unknown>;
  requestChange: (message: string) => Promise<unknown>;
};

/** 화면이 넘겨주는 조회 상태 — useMobileQuery · useChildQuery 모두 맞는 모양 */
export type LunchQuery = {
  data: LunchData | null;
  error: string | null;
  isLoading: boolean;
  isRefreshing: boolean;
  refresh: () => unknown;
  retry: () => unknown;
};

/** 머리글 제목 — 학부모 "홍길동 학생" · 학생 "내 도시락" */
export function lunchSubject(adapter: Pick<LunchAdapter, 'audience'>, data: Pick<LunchData, 'studentName'>) {
  return adapter.audience === 'parent' ? `${data.studentName} 학생` : '내 도시락';
}
