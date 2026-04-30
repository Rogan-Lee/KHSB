// 학부모 월간 보고서 초안 생성용 Groq 프롬프트 빌더.
// buildWeeklyReportPrompt 의 월간 버전.

import type { KakaoLogTag } from "@/lib/online/kakao-tags";

type DailyLog = {
  logDate: Date;
  summary: string;
  tags: string[];
  isParentVisible: boolean;
};

type SubjectProgressRow = {
  subject: string;
  currentTopic: string;
  textbookPage: string | null;
  weeklyProgress: number | null;
  notes: string | null;
  recordedAt: Date;
};

type TaskResultRow = {
  subject: string;
  title: string;
  score: string | null;
  consultantSummary: string | null;
  finalizedAt: Date | null;
};

type WeeklyPlanSource = {
  weekStart: Date;
  goals: Record<string, string>;
  studyHours: number | null;
  retrospective: string | null;
};

type MonthlyPlanSource = {
  subjectGoals: Record<string, string>;
  milestones: Record<string, string>;
  retrospective: string | null;
};

export type MonthlyReportInputs = {
  studentName: string;
  studentGrade: string;
  yearMonth: string; // "2026-05"
  periodStartIso: string;
  periodEndIso: string;
  dailyLogs: DailyLog[];
  subjectProgress: SubjectProgressRow[];
  completedTaskResults: TaskResultRow[];
  weeklyPlans: WeeklyPlanSource[];
  monthlyPlan: MonthlyPlanSource | null;
};

export function buildMonthlyReportPrompt(inputs: MonthlyReportInputs): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt =
    "너는 관리형 독서실 원장이 학부모에게 보낼 월간 학부모 보고서 초안을 작성하는 조력자야. " +
    "한 달간의 학습 흐름을 자연스럽게 서술하되, 근거는 관리 멘토의 일일 대화 요약 · 주간 계획 · 월간 계획 · 과목별 진도 · 완료된 수행평가 결과물 에서만 가져와. " +
    "섹션 구조는 다음 5개: 1) 이번 달 총평, 2) 과목별 진도 및 주요 변화, 3) 수행평가·평가 결과, 4) 관리 멘토 상담 하이라이트, 5) 다음 달 계획. " +
    "각 섹션을 마크다운 **굵은 제목**으로 구분하고, 내용은 문단 단위 정중하고 따뜻한 한국어로. " +
    "학생 이름과 학년은 자연스럽게 언급. 내부 메모·민감 정보·비공개 로그는 제외. " +
    "숫자나 일자는 제공된 값만 그대로 사용.";

  const lines: string[] = [];
  lines.push(
    `${inputs.studentName}(${inputs.studentGrade}) 학생의 ${inputs.yearMonth} (${inputs.periodStartIso} ~ ${inputs.periodEndIso}) 월간 자료입니다.`
  );

  // 1) 월간 계획
  if (inputs.monthlyPlan) {
    lines.push("\n## 월간 계획 (작성 내용)");
    const goalEntries = Object.entries(inputs.monthlyPlan.subjectGoals);
    if (goalEntries.length > 0) {
      lines.push("### 과목별 목표");
      for (const [subject, text] of goalEntries) {
        lines.push(`- ${subject}: ${text}`);
      }
    }
    const milestones = Object.entries(inputs.monthlyPlan.milestones).sort(
      ([a], [b]) => a.localeCompare(b)
    );
    if (milestones.length > 0) {
      lines.push("### 마일스톤");
      for (const [date, label] of milestones) {
        lines.push(`- ${date}: ${label}`);
      }
    }
    if (inputs.monthlyPlan.retrospective) {
      lines.push(`### 월간 회고\n${inputs.monthlyPlan.retrospective}`);
    }
  }

  // 2) 주간 계획들
  if (inputs.weeklyPlans.length > 0) {
    lines.push("\n## 주간 계획 요약");
    for (const wp of inputs.weeklyPlans) {
      const wStart = wp.weekStart.toISOString().slice(0, 10);
      const summary: string[] = [`- 주 ${wStart}:`];
      const goalCount = Object.keys(wp.goals).length;
      if (goalCount > 0) summary.push(`${goalCount}과목 목표 설정`);
      if (wp.studyHours != null) summary.push(`예상 ${wp.studyHours}시간`);
      if (wp.retrospective) summary.push(`회고: "${wp.retrospective.slice(0, 80)}"`);
      lines.push(summary.join(" · "));
    }
  }

  // 3) 일일 대화
  const publicLogs = inputs.dailyLogs.filter((l) => l.isParentVisible);
  if (publicLogs.length > 0) {
    lines.push("\n## 일일 대화 기록 (학부모 공개)");
    for (const log of publicLogs) {
      const tags = log.tags.length > 0 ? ` [${log.tags.join(", ")}]` : "";
      lines.push(
        `- ${log.logDate.toISOString().slice(0, 10)}${tags}: ${log.summary}`
      );
    }
  }

  // 4) 과목별 진도 (월 최신)
  if (inputs.subjectProgress.length > 0) {
    lines.push("\n## 과목별 진도 변화 (월내 최신 스냅샷)");
    // subject 별로 최신 1건만
    const latestBySubject = new Map<string, SubjectProgressRow>();
    for (const p of inputs.subjectProgress) {
      if (!latestBySubject.has(p.subject)) latestBySubject.set(p.subject, p);
    }
    for (const p of latestBySubject.values()) {
      const parts: string[] = [`- ${p.subject}: ${p.currentTopic}`];
      if (p.textbookPage) parts.push(`(${p.textbookPage})`);
      if (p.weeklyProgress != null) parts.push(`${p.weeklyProgress}% 진행`);
      if (p.notes) parts.push(`· 이슈: ${p.notes}`);
      lines.push(parts.join(" "));
    }
  }

  // 5) 완료된 수행평가
  if (inputs.completedTaskResults.length > 0) {
    lines.push("\n## 완료된 수행평가 결과 (학부모 보고서 포함 플래그)");
    for (const t of inputs.completedTaskResults) {
      const parts: string[] = [`- ${t.subject} "${t.title}"`];
      if (t.score) parts.push(`점수: ${t.score}`);
      if (t.consultantSummary) parts.push(`총평: ${t.consultantSummary}`);
      lines.push(parts.join(" · "));
    }
  }

  // satisfy unused import warning
  void (null as KakaoLogTag | null);

  lines.push("\n위 자료를 바탕으로 학부모에게 보낼 월간 학부모 보고서 초안을 작성해 주세요.");

  return {
    systemPrompt,
    userPrompt: lines.join("\n"),
  };
}
