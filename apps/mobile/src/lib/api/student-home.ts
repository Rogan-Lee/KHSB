import type { Tone } from '@/design';
import type { StudentBadges } from '@/lib/badges';
import type { MobileTaskSummary } from '@/lib/mobile-api';

// 학생 홈·전체 탭 — 서버 src/lib/mobile-student-home.ts (GET /api/mobile/v1/student/home)

export const STUDENT_HOME_PATH = '/api/mobile/v1/student/home';

export type TaskStatus = MobileTaskSummary['status'];

export type StudentHomeSession = {
  id: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  hostName: string;
  meetUrl: string | null;
};

export type StudentHomeResponse = {
  student: {
    name: string;
    grade: string;
    school: string | null;
    isOnlineManaged: boolean;
  };
  mentoring: { isToday: boolean; sessions: StudentHomeSession[] };
  questions: { open: number };
  tasks: {
    total: number;
    done: number;
    open: number;
    next: {
      id: string;
      subject: string;
      title: string;
      dueDate: string;
      status: TaskStatus;
    } | null;
  };
  /** 온라인 관리 학생만 (그 외 null) */
  survey: { submitted: boolean; filled: number; total: number } | null;
  points: { balance: number; krw: number };
  seasonal: { lunchOpen: boolean; examOpenCount: number };
  contentCount: number;
  badges: StudentBadges;
};

// ─── 상태 라벨·톤 — 웹 src/components/portal/status.ts 와 동일 ───

type StatusMeta = { label: string; tone: Tone };

export const TASK_STATUS: Record<TaskStatus, StatusMeta> = {
  OPEN: { label: '진행 전', tone: 'gray' },
  IN_PROGRESS: { label: '진행 중', tone: 'info' },
  SUBMITTED: { label: '제출 완료', tone: 'warn' },
  NEEDS_REVISION: { label: '수정 필요', tone: 'bad' },
  DONE: { label: '최종 완료', tone: 'ok' },
};

/** 마감 D-day 배지 — 웹 portal/ui.tsx dueInfo 와 같은 규칙 */
export function dueInfo(dueDate: string, done = false): { label: string; tone: Tone; days: number } {
  const days = Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86_400_000);
  const label = days < 0 ? `D+${-days}` : days === 0 ? 'D-Day' : `D-${days}`;
  const tone: Tone = done ? 'gray' : days < 0 ? 'bad' : days <= 1 ? 'brand' : days <= 3 ? 'warn' : 'gray';
  return { label, tone, days };
}

// ─── KST 표시 헬퍼 ───

const KST_OFFSET = 9 * 60 * 60 * 1000;

/** "9월 25일 (목) 19:30" — 웹 홈 멘토링 시각과 같은 형식 */
export function formatSessionTime(iso: string): string {
  const d = new Date(new Date(iso).getTime() + KST_OFFSET);
  const wd = ['일', '월', '화', '수', '목', '금', '토'][d.getUTCDay()];
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${wd}) ${hh}:${mm}`;
}

/** 시간대별 인사 — 웹 홈 greeting() 과 동일 */
export function greeting(now = new Date()): string {
  const h = new Date(now.getTime() + KST_OFFSET).getUTCHours();
  if (h < 5) return '늦은 시간까지 수고 많아요';
  if (h < 12) return '좋은 아침이에요';
  if (h < 18) return '오후도 힘내요';
  return '오늘 하루도 고생했어요';
}
