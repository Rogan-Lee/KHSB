// 학부모 — 리포트함 · 리포트 본문(앱 네이티브) · 성장 탭(성적·영단어·생활·과제) API 타입과 클라이언트.
// 서버: src/lib/mobile-parent-reports.ts, src/lib/mobile-parent-growth.ts
// 월간 리포트 본문 타입은 R2 영역(@/features/parent/report-monthly 쪽)에서 따로 정의한다.

import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { toast } from '@/design';
import { mutateMobileApi, requestMobileApi } from '@/lib/mobile-api';

// ─── 리포트함 ────────────────────────────────────────────────────────

export type ParentReportKind = 'mentoring' | 'monthly' | 'online' | 'study-plan' | 'consultation';

/** 이 파일의 본문 타입으로 그리는 리포트 (월간은 MonthlyReportView 가 따로 그린다) */
export type ParentReportDetailKind = Exclude<ParentReportKind, 'monthly'>;

export type ParentReportItem = {
  /** `${kind}:${id}` */
  key: string;
  id: string;
  kind: ParentReportKind;
  title: string;
  subtitle: string | null;
  /** 발송(작성) 시각 ISO */
  date: string;
  /** 최근 7일 안에 온 리포트 */
  isNew: boolean;
};

export type ParentReportInboxResponse = {
  studentId: string;
  reports: ParentReportItem[];
  counts: Record<ParentReportKind, number> & { all: number };
  newCount: number;
};

// ─── 리포트 본문 — GET /parent/reports/{kind}/{id} ──────────────────

export type ParentReportStudent = { name: string; grade: string | null; school: string | null };

export type MentoringSectionKey = 'content' | 'improvements' | 'weaknesses' | 'nextGoals' | 'notes';

export type ParentReportVocabPoint = {
  id: string;
  source: 'paper' | 'online';
  /** YYYY-MM-DD */
  date: string;
  score: number;
  correct: number;
  total: number;
};

export type ParentReportExamPoint = {
  key: string;
  /** YYYY-MM-DD */
  date: string;
  name: string;
  type: 'OFFICIAL_MOCK' | 'PRIVATE_MOCK' | 'SCHOOL_EXAM';
  typeLabel: string;
  /** 국·수·영·탐구 평균 등급 (한국사·제2외국어 제외) */
  averageGrade: number | null;
  grades: Record<string, number>;
};

export type ParentMentoringReport = {
  kind: 'mentoring';
  id: string;
  createdAt: string;
  student: ParentReportStudent;
  session: {
    /** 멘토링 날짜(없으면 작성일) — KST YYYY-MM-DD */
    date: string;
    hasMentoring: boolean;
    completed: boolean;
    /** "14:05 ~ 15:10" */
    time: string | null;
    mentorName: string | null;
  };
  /** 멘토 안내사항 */
  message: string | null;
  /** 오늘 멘토링 내용 · 개선된 점 · 보완할 점 · 다음 멘토링 목표 · 기타 메모 (빈 항목 제외, 순서 고정) */
  sections: { key: MentoringSectionKey; title: string; body: string }[];
  /** 영단어·원생 기록·상벌점을 모은 달 */
  period: { year: number; month: number };
  vocab: { count: number; average: number; latest: number; points: ParentReportVocabPoint[] } | null;
  monthlyNote: string | null;
  merits: {
    merit: { count: number; points: number };
    demerit: { count: number; points: number };
    items: {
      id: string;
      date: string;
      type: 'MERIT' | 'DEMERIT';
      points: number;
      reason: string;
      category: string | null;
    }[];
  } | null;
  studyPlan: { note: string | null; images: string[] } | null;
  scores: {
    /** 양수 = 등급이 올랐어요 */
    avgImprovement: number | null;
    mentoringCount: number;
    studyHours: number;
    /** 오래된 → 최근 */
    exams: ParentReportExamPoint[];
    subjects: {
      subject: string;
      firstGrade: number | null;
      latestGrade: number | null;
      improvement: number | null;
      firstExamName: string | null;
      latestExamName: string | null;
    }[];
  } | null;
};

export type ParentOnlineReport = {
  kind: 'online';
  id: string;
  type: string;
  /** 주간 · 월간 · 수시 */
  typeLabel: string;
  title: string;
  student: ParentReportStudent;
  /** YYYY-MM-DD */
  periodStart: string;
  periodEnd: string;
  sentAt: string | null;
  markdown: string;
  feedbackEnabled: boolean;
};

export type ParentStudyPlanReport = {
  kind: 'study-plan';
  id: string;
  createdAt: string;
  student: ParentReportStudent;
  images: string[];
};

export type ParentConsultationReport = {
  kind: 'consultation';
  id: string;
  createdAt: string;
  student: ParentReportStudent;
  recipientName: string | null;
  consultedAt: string | null;
  content: string;
};

export type ParentReportDetail =
  | ParentMentoringReport
  | ParentOnlineReport
  | ParentStudyPlanReport
  | ParentConsultationReport;

export const parentReportPaths = {
  inbox: (studentId: string) =>
    `/api/mobile/v1/parent/reports?studentId=${encodeURIComponent(studentId)}&kind=all`,
  detail: (kind: ParentReportKind, id: string) =>
    `/api/mobile/v1/parent/reports/${kind}/${encodeURIComponent(id)}`,
};

/** 앱 라우트 — 알림 딥링크도 이 경로를 쓴다 */
export const parentReportRoute = (kind: ParentReportKind, id: string) =>
  `/(parent)/reports/${kind}/${encodeURIComponent(id)}`;

/** 온라인 관리 보고서 — 원장님께 의견 남기기 (웹 공개 페이지 피드백과 같은 저장·알림) */
export function submitOnlineReportFeedback(reportId: string, content: string) {
  return mutateMobileApi<{ ok: true }>(
    `/api/mobile/v1/parent/reports/online/${encodeURIComponent(reportId)}/feedback`,
    'POST',
    { content }
  );
}

// ─── 성장 탭 ─────────────────────────────────────────────────────────

export type ParentExamGroup = {
  key: string;
  name: string;
  type: 'OFFICIAL_MOCK' | 'PRIVATE_MOCK' | 'SCHOOL_EXAM' | 'DUFF' | string;
  typeLabel: string;
  /** YYYY-MM-DD */
  date: string;
  averageGrade: number | null;
  subjects: {
    subject: string;
    grade: number | null;
    rawScore: number | null;
    percentile: number | null;
  }[];
};

export type ParentExamsResponse = {
  studentId: string;
  groups: ParentExamGroup[];
  trend: {
    key: string;
    date: string;
    name: string;
    averageGrade: number | null;
    grades: Record<string, number>;
  }[];
  trendSubjects: string[];
  subjectChanges: {
    subject: string;
    first: number;
    latest: number;
    firstExam: string;
    latestExam: string;
    change: number;
  }[];
};

export type ParentVocabItem = {
  id: string;
  source: 'paper' | 'online';
  date: string;
  title: string;
  score: number;
  correct: number;
  total: number;
};

export type ParentVocabResponse = {
  studentId: string;
  stats: { count: number; average: number | null; latest: number | null };
  trend: { id: string; date: string; score: number }[];
  recent: ParentVocabItem[];
};

export type ParentMeritMonth = {
  month: string;
  year: number;
  monthNumber: number;
  merit: { count: number; points: number };
  demerit: { count: number; points: number };
  note: string | null;
  items: {
    id: string;
    date: string;
    type: 'MERIT' | 'DEMERIT';
    points: number;
    reason: string;
    category: string | null;
  }[];
};

export type ParentMeritsResponse = { studentId: string; months: ParentMeritMonth[] };

export type ParentTaskItem = {
  id: string;
  subject: string;
  title: string;
  dueDate: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'SUBMITTED' | 'NEEDS_REVISION' | 'DONE' | string;
  statusLabel: string;
  score: string | null;
};

export type ParentTasksResponse = {
  studentId: string;
  isOnlineManaged: boolean;
  counts: {
    total: number;
    open: number;
    inProgress: number;
    submitted: number;
    needsRevision: number;
    done: number;
  };
  upcoming: ParentTaskItem[];
  overdue: ParentTaskItem[];
  recentDone: ParentTaskItem[];
};

export type GrowthSection = 'exams' | 'vocab' | 'merits' | 'tasks';

export const parentGrowthPath = (section: GrowthSection, studentId: string) =>
  `/api/mobile/v1/parent/${section}?studentId=${encodeURIComponent(studentId)}`;

// ─── 자녀별 조회 훅 ──────────────────────────────────────────────────
// useMobileQuery 와 같은 모양이지만 경로(=자녀)별로 결과를 따로 보관한다.
// 자녀를 바꾸면 이전 자녀의 데이터가 잠깐이라도 보이지 않고, 다시 돌아오면 캐시가 바로 보인다.
// path 가 null 이면 아무것도 불러오지 않는다 (보이지 않는 탭).

const cache = new Map<string, unknown>();

export type ParentQuery<T> = {
  data: T | null;
  error: string | null;
  /** 보여 줄 데이터도 오류도 없는 첫 로드 */
  isLoading: boolean;
  isRefreshing: boolean;
  refresh: () => Promise<void>;
  retry: () => void;
};

type Entry<T> = { data?: T; error?: string; refreshing?: boolean };

export function useParentQuery<T>(path: string | null): ParentQuery<T> {
  const [entries, setEntries] = useState<Record<string, Entry<T>>>({});
  const [attempt, setAttempt] = useState(0);

  const settle = useCallback((p: string, result: { data: T } | { error: string }, keepError = false) => {
    if ('data' in result) cache.set(p, result.data);
    setEntries((e) => ({
      ...e,
      [p]:
        'data' in result
          ? { data: result.data }
          : // 조용한 재조회 실패는 화면을 바꾸지 않는다
            { ...e[p], refreshing: false, error: keepError ? e[p]?.error : result.error },
    }));
  }, []);

  // 경로(자녀·탭)가 바뀌거나 다시 시도하면 불러온다
  useEffect(() => {
    if (!path) return;
    let active = true;
    requestMobileApi<T>(path)
      .then((data) => active && settle(path, { data }))
      .catch((err) => active && settle(path, { error: errorMessage(err) }));
    return () => {
      active = false;
    };
  }, [path, attempt, settle]);

  // 다른 화면에서 돌아오면 조용히 다시 불러온다.
  // 경로가 바뀌어 콜백이 다시 도는 경우(자녀·탭 전환)는 위 effect 가 이미 불러오므로 건너뛴다.
  const focusedPath = useRef<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!path) {
        focusedPath.current = null;
        return;
      }
      const samePath = focusedPath.current === path;
      focusedPath.current = path;
      if (!samePath) return;
      let active = true;
      requestMobileApi<T>(path)
        .then((data) => active && settle(path, { data }))
        .catch((err) => active && settle(path, { error: errorMessage(err) }, true));
      return () => {
        active = false;
      };
    }, [path, settle])
  );

  const entry = path ? entries[path] : undefined;
  const data = (entry?.data ?? (path ? cache.get(path) : undefined)) as T | undefined;
  const error = entry?.error ?? null;

  const refresh = useCallback(async () => {
    if (!path) return;
    setEntries((e) => ({ ...e, [path]: { ...e[path], refreshing: true } }));
    try {
      settle(path, { data: await requestMobileApi<T>(path) });
    } catch (err) {
      const message = errorMessage(err);
      // 당겨서 새로고침 실패 — 보던 화면은 그대로 두고 알려만 준다
      toast(message, 'error');
      settle(path, { error: message });
    }
  }, [path, settle]);

  const retry = useCallback(() => {
    if (!path) return;
    setEntries((e) => ({ ...e, [path]: { ...e[path], error: undefined } }));
    setAttempt((n) => n + 1);
  }, [path]);

  return {
    data: data ?? null,
    error,
    isLoading: !!path && data == null && !error,
    isRefreshing: !!entry?.refreshing,
    refresh,
    retry,
  };
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : '데이터를 불러오지 못했어요.';
}
