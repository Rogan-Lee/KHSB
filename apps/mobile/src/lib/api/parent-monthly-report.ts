// 학부모 — 월간 리포트(네이티브) 응답 타입. 서버: src/lib/mobile-parent-monthly-report.ts

export type MonthlyExamType = 'OFFICIAL_MOCK' | 'PRIVATE_MOCK' | 'SCHOOL_EXAM' | 'DUFF';

export type MonthlyExamSubject = {
  subject: string;
  grade: number | null;
  percentile: number | null;
  rawScore: number | null;
};

export type MonthlyRecentExam = {
  key: string;
  name: string;
  type: MonthlyExamType;
  typeLabel: string;
  /** YYYY-MM-DD */
  date: string;
  /** 리포트 달에 본 시험 */
  isThisMonth: boolean;
  subjects: MonthlyExamSubject[];
};

/** 추이 차트 한 칸 — 시리즈 키(시험 종류 또는 과목) → 값 */
export type MonthlyTrendRow = {
  key: string;
  /** YYYY-MM-DD */
  date: string;
  title: string;
  grade: Record<string, number>;
  percentile: Record<string, number>;
};

export type MonthlyExamTrend = {
  examTypes: MonthlyExamType[];
  subjects: string[];
  byType: MonthlyTrendRow[];
  bySubject: MonthlyTrendRow[];
};

export type ParentMonthlyReport = {
  id: string;
  year: number;
  month: number;
  sentAt: string;
  student: {
    id: string;
    name: string;
    school: string | null;
    grade: string;
    targetUniversity: string | null;
  };
  summary: {
    mentoringCount: number;
    meritPoints: number;
    demeritPoints: number;
    meritItemCount: number;
    patrolNoteCount: number;
  };
  mentoringSummary: string | null;
  directorComment: string | null;
  exams: { recent: MonthlyRecentExam[]; trend: MonthlyExamTrend } | null;
  vocab: {
    count: number;
    average: number;
    latest: number;
    points: { id: string; date: string; score: number; correct: number; total: number }[];
  } | null;
  note: { content: string } | null;
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
  };
  patrol: {
    noteCount: number;
    absentCount: number;
    notes: { id: string; date: string; note: string }[];
  };
  photos: { id: string; url: string; thumbnailUrl: string | null }[];
  admissionInfo: string | null;
  notices: {
    operations: string | null;
    awards: {
      id: string;
      name: string;
      category: string;
      categoryLabel: string;
      description: string | null;
      isMine: boolean;
    }[];
    recommendation: string | null;
  };
};

export const parentMonthlyReportPath = (id: string) =>
  `/api/mobile/v1/parent/reports/monthly/${encodeURIComponent(id)}`;
