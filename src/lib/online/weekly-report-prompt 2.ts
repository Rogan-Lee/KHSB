// 학부모 주간 보고서 초안 생성용 Groq 프롬프트 빌더.
// `src/actions/ai-enhance.ts::generateMonthlyMentoringSummary` 패턴 변주.

import { KAKAO_LOG_TAGS } from "@/lib/online/kakao-tags";

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
};

type WeeklyPlanSource = {
  goals: Record<string, string>;
  studyHours: number | null;
  retrospective: string | null;
};

export type WeeklyReportInputs = {
  studentName: string;
  studentGrade: string;
  weekStartIso: string; // "YYYY-MM-DD"
  weekEndIso: string;
  dailyLogs: DailyLog[];
  subjectProgress: SubjectProgressRow[];
  completedTaskResults: TaskResultRow[];
  weeklyPlan: WeeklyPlanSource | null;
};

/** Groq 에 넘길 user prompt 를 구성한다. 학부모 공개(isParentVisible=true) 로그만 포함. */
export function buildWeeklyReportPrompt(inputs: WeeklyReportInputs): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt =
    "너는 관리형 독서실 원장이 학부모에게 보낼 주간 보고서 초안을 작성하는 조력자야. " +
    "관리 멘토의 일일 대화 요약, 과목별 진도, 수행평가 결과, 주간 계획을 바탕으로 " +
    "학부모가 한눈에 이해할 수 있게 정중하고 따뜻한 한국어 단락으로 작성해. " +
    "섹션 구조는 다음 4개: 1) 이번 주 학습 개요, 2) 과목별 진도, 3) 수행평가 진행, 4) 다음 주 계획. " +
    "각 섹션을 마크다운 **굵은 제목**으로 구분하고, 내용은 간결한 문장으로. " +
    "학생 이름과 학년은 언급해도 괜찮아. 내부 메모·개인 식별정보·민감 정보는 제외해. " +
    "추측이나 과장된 표현은 피하고 제공된 데이터만 사용해.";

  const lines: string[] = [];
  lines.push(
    `${inputs.studentName}(${inputs.studentGrade}) 학생의 ${inputs.weekStartIso} ~ ${inputs.weekEndIso} 주간 자료입니다.`
  );

  // 1) 일일 대화 로그 (공개된 것만)
  const publicLogs = inputs.dailyLogs.filter((l) => l.isParentVisible);
  if (publicLogs.length > 0) {
    lines.push("\n## 일일 대화 요약 (관리 멘토 기록)");
    for (const log of publicLogs) {
      const tags = log.tags.length > 0 ? ` [${log.tags.join(", ")}]` : "";
      lines.push(
        `- ${log.logDate.toISOString().slice(0, 10)}${tags}: ${log.summary}`
      );
    }
  } else {
    lines.push("\n## 일일 대화 요약\n(해당 주에 학부모 공개 기록이 없음)");
  }

  // 2) 과목별 진도
  if (inputs.subjectProgress.length > 0) {
    lines.push("\n## 과목별 진도 (해당 주 스냅샷)");
    for (const p of inputs.subjectProgress) {
      const parts: string[] = [`- ${p.subject}: ${p.currentTopic}`];
      if (p.textbookPage) parts.push(`(${p.textbookPage})`);
      if (p.weeklyProgress != null) parts.push(`${p.weeklyProgress}% 진행`);
      if (p.notes) parts.push(`· 이슈: ${p.notes}`);
      lines.push(parts.join(" "));
    }
  }

  // 3) 수행평가 결과 (포함 플래그 true 만)
  if (inputs.completedTaskResults.length > 0) {
    lines.push("\n## 수행평가 결과");
    for (const t of inputs.completedTaskResults) {
      const parts: string[] = [`- ${t.subject} "${t.title}"`];
      if (t.score) parts.push(`점수/평가: ${t.score}`);
      if (t.consultantSummary) parts.push(`총평: ${t.consultantSummary}`);
      lines.push(parts.join(" · "));
    }
  }

  // 4) 주간 계획
  if (inputs.weeklyPlan) {
    lines.push("\n## 주간 계획");
    const goalEntries = Object.entries(inputs.weeklyPlan.goals);
    if (goalEntries.length > 0) {
      for (const [subject, text] of goalEntries) {
        lines.push(`- ${subject}: ${text}`);
      }
    }
    if (inputs.weeklyPlan.studyHours != null) {
      lines.push(`- 예상 학습시간: ${inputs.weeklyPlan.studyHours}시간`);
    }
    if (inputs.weeklyPlan.retrospective) {
      lines.push(`- 주간 회고: ${inputs.weeklyPlan.retrospective}`);
    }
  }

  lines.push("\n위 자료를 바탕으로 학부모에게 보낼 주간 보고서 초안을 작성해 주세요.");
  lines.push(
    `(허용 태그만 사용: ${KAKAO_LOG_TAGS.join(", ")} — 이 외 정보는 언급 금지)`
  );

  return {
    systemPrompt,
    userPrompt: lines.join("\n"),
  };
}
