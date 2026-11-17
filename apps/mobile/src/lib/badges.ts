import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { requestMobileApi } from '@/lib/mobile-api';

// 탭바·홈 배지. 서버: /api/mobile/v1/{student,staff,parent}/badges (src/lib/mobile-badges.ts)
// 갱신 시점: 마운트 · 앱 활성화 · 60초마다 · refreshBadges() 호출 (읽음 처리 직후 등)

export type StudentBadges = {
  tasks: number;
  feedback: number;
  chat: number;
  vocab: number;
  hasVocab: boolean;
  qna: number;
  suggestions: number;
  /** 가족 톡방 안 읽은 메시지 — 메시지 탭에 더해 보여 준다 (구버전 서버는 필드가 없다) */
  familyChat?: number;
  /** 아직 [확인했어요]를 안 누른 운영진 지시 (구버전 서버는 필드가 없다) */
  instructions?: number;
  menu: number;
};

export type StaffBadges = {
  inbox: number;
  questions: number;
  chats: number;
  dm: number;
  /** 학생·학부모 글을 운영진이 아직 안 본 가족 톡방 수 (inbox 에 이미 더해짐, 구버전 서버는 필드가 없다) */
  familyChats?: number;
  approvals: number;
  lunchRequests: number;
  suggestions: number;
  /** 처리 안 한 학부모 요청 — 학생 지시 받은함 (home 에 이미 더해짐, 구버전 서버는 필드가 없다) */
  instructions?: number;
  home: number;
  mentoring: number;
  menu: number;
};

/** tuition — 결제할 수강료 청구서 수 · familyChat — 가족 톡방 안 읽은 메시지 (구버전 서버는 필드가 없다) */
export type ParentBadges = { reports: number; menu: number; tuition?: number; familyChat?: number };

const listeners = new Set<() => void>();

/** 읽음 처리·제출 직후 호출 — 떠 있는 모든 배지 훅이 다시 불러온다 */
export function refreshBadges() {
  listeners.forEach((fn) => fn());
}

function useBadges<T>(path: string, empty: T): T {
  const [data, setData] = useState<T>(empty);

  const load = useCallback(() => {
    requestMobileApi<T>(path)
      .then(setData)
      .catch(() => {});
  }, [path]);

  useEffect(() => {
    load();
    listeners.add(load);
    const timer = setInterval(load, 60_000);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && load());
    return () => {
      listeners.delete(load);
      clearInterval(timer);
      sub.remove();
    };
  }, [load]);

  return data;
}

export const useStudentBadges = () =>
  useBadges<StudentBadges>('/api/mobile/v1/student/badges', {
    tasks: 0,
    feedback: 0,
    chat: 0,
    vocab: 0,
    hasVocab: false,
    qna: 0,
    suggestions: 0,
    menu: 0,
  });

export const useStaffBadges = () =>
  useBadges<StaffBadges>('/api/mobile/v1/staff/badges', {
    inbox: 0,
    questions: 0,
    chats: 0,
    dm: 0,
    approvals: 0,
    lunchRequests: 0,
    suggestions: 0,
    home: 0,
    mentoring: 0,
    menu: 0,
  });

export const useParentBadges = () =>
  useBadges<ParentBadges>('/api/mobile/v1/parent/badges', { reports: 0, menu: 0 });
