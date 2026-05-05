// 온보딩 설문 섹션 템플릿.
// sections JSON 의 키는 section.key 기준. 값은 kind 별로 다른 shape.
// 향후 추가 섹션도 같은 패턴으로 구조화 가능 (kind discriminator).

// ─────────────── 섹션 타입 ───────────────

type BaseSection = {
  key: string;
  title: string;
  description: string;
};

export type TextSection = BaseSection & {
  kind: "text";
  placeholder: string;
};

export type PerformanceSection = BaseSection & {
  kind: "performance";
};

export type HistorySection = BaseSection & {
  kind: "history";
};

export type GoalsSection = BaseSection & {
  kind: "goals";
};

export type SurveySection = TextSection | PerformanceSection | HistorySection | GoalsSection;

// ─────────────── Q5 (performance) 답변 스키마 ───────────────

export const PERFORMANCE_METHOD_OPTIONS = [
  "실험",
  "자료분석",
  "토론",
  "발표",
  "프로젝트",
  "기타",
] as const;

export const PERFORMANCE_OUTPUT_OPTIONS = [
  "보고서",
  "발표자료",
  "영상",
  "코드",
  "실험결과",
  "기타",
] as const;

export const CAREER_LEVELS = [
  { value: "interested", label: "관심 있음" },
  { value: "exploring", label: "탐색 중" },
  { value: "specified", label: "구체화됨" },
] as const;

export type PerformanceSubject = {
  subject: string;
  topic: string;
  methods: string[];
  methodOther?: string;
  selfRole: string;
};

export type PerformanceBook = {
  title: string;
  reason: string;
  linkedSubject: string;
  expansion: string;
};

export type PerformanceAnswer = {
  subjects: PerformanceSubject[];
  books: PerformanceBook[];
  careerLevel: "" | "interested" | "exploring" | "specified";
  careerDetail: string;
  outputs: string[];
  outputOther?: string;
  // 마이그레이션: 기존 free-text 답변 보존 (readonly 표시)
  legacyText?: string;
};

export function emptyPerformanceSubject(): PerformanceSubject {
  return { subject: "", topic: "", methods: [], methodOther: "", selfRole: "" };
}
export function emptyPerformanceBook(): PerformanceBook {
  return { title: "", reason: "", linkedSubject: "", expansion: "" };
}
export function emptyPerformanceAnswer(): PerformanceAnswer {
  return {
    subjects: [emptyPerformanceSubject()],
    books: [emptyPerformanceBook()],
    careerLevel: "",
    careerDetail: "",
    outputs: [],
    outputOther: "",
  };
}

/** 레거시 string 답변을 새 구조로 정규화. */
export function normalizePerformanceAnswer(raw: unknown): PerformanceAnswer {
  if (typeof raw === "string") {
    return { ...emptyPerformanceAnswer(), legacyText: raw };
  }
  if (raw && typeof raw === "object") {
    const r = raw as Partial<PerformanceAnswer>;
    return {
      subjects: Array.isArray(r.subjects) && r.subjects.length > 0 ? r.subjects : [emptyPerformanceSubject()],
      books: Array.isArray(r.books) && r.books.length > 0 ? r.books : [emptyPerformanceBook()],
      careerLevel: r.careerLevel ?? "",
      careerDetail: typeof r.careerDetail === "string" ? r.careerDetail : "",
      outputs: Array.isArray(r.outputs) ? r.outputs : [],
      outputOther: r.outputOther ?? "",
      legacyText: typeof r.legacyText === "string" ? r.legacyText : undefined,
    };
  }
  return emptyPerformanceAnswer();
}

/** Q5 완료 여부 (모든 항목 필수). */
export function isPerformanceComplete(answer: PerformanceAnswer): boolean {
  // 과목별 탐구 — 1개+ 필수, 각 row 모두 채워야
  if (answer.subjects.length === 0) return false;
  for (const s of answer.subjects) {
    if (!s.subject.trim() || !s.topic.trim() || !s.selfRole.trim()) return false;
    if (s.methods.length === 0) return false;
    if (s.methods.includes("기타") && !s.methodOther?.trim()) return false;
  }
  // 교과 연계 독서 — 1개+ 필수, 각 row 모두 채워야
  if (answer.books.length === 0) return false;
  for (const b of answer.books) {
    if (!b.title.trim() || !b.reason.trim() || !b.linkedSubject.trim() || !b.expansion.trim()) return false;
  }
  // 진로 탐색 — 라디오 선택 필수, specified 선택 시 detail 필수
  if (!answer.careerLevel) return false;
  if (answer.careerLevel === "specified" && !answer.careerDetail.trim()) return false;
  // 활동 결과물 — 1개+ 필수, 기타 선택 시 outputOther 필수
  if (answer.outputs.length === 0) return false;
  if (answer.outputs.includes("기타") && !answer.outputOther?.trim()) return false;
  return true;
}

// ─────────────── Q1 (history) 답변 스키마 ───────────────

export const HISTORY_SUBJECT_OPTIONS = ["국", "수", "영", "사", "과", "기타"] as const;
export const HISTORY_FORMAT_OPTIONS = [
  { value: "현강", label: "현강" },
  { value: "인강", label: "인강" },
  { value: "과외", label: "과외" },
  { value: "관리형", label: "관리형" },
] as const;
export const HISTORY_PLACE_OPTIONS = [
  "독서실",
  "집",
  "학원 자습실",
  "카페",
  "학교 야자",
  "기타",
] as const;
export const HISTORY_MIX_KEYS = ["school", "academy", "online", "selfStudy"] as const;
export const HISTORY_MIX_LABELS: Record<(typeof HISTORY_MIX_KEYS)[number], string> = {
  school: "학교",
  academy: "학원",
  online: "인강",
  selfStudy: "자기주도",
};

export type HistoryFormat = "" | "현강" | "인강" | "과외" | "관리형";

export type PriorEducation = {
  institution: string;
  periodFrom: string; // YYYY-MM
  periodTo: string;   // YYYY-MM
  subjects: string[]; // HISTORY_SUBJECT_OPTIONS
  subjectOther?: string;
  format: HistoryFormat;
  quitReason: string;
};

export type StudyMix = {
  school: number;
  academy: number;
  online: number;
  selfStudy: number;
};

export type PriorConsulting =
  | { had: "" }
  | { had: "no" }
  | {
      had: "yes";
      institution: string;
      period: string;
      satisfaction: number; // 1-5
    };

export type HistoryAnswer = {
  priorEducation: PriorEducation[];
  hasPriorEducation: "" | "yes" | "no"; // "no" 면 priorEducation 검사 스킵
  currentMix: StudyMix;
  studyPlace: "" | (typeof HISTORY_PLACE_OPTIONS)[number];
  studyPlaceOther?: string;
  priorConsulting: PriorConsulting;
  legacyText?: string;
};

export function emptyPriorEducation(): PriorEducation {
  return {
    institution: "",
    periodFrom: "",
    periodTo: "",
    subjects: [],
    subjectOther: "",
    format: "",
    quitReason: "",
  };
}
export function emptyStudyMix(): StudyMix {
  return { school: 0, academy: 0, online: 0, selfStudy: 0 };
}
export function emptyHistoryAnswer(): HistoryAnswer {
  return {
    priorEducation: [emptyPriorEducation()],
    hasPriorEducation: "",
    currentMix: emptyStudyMix(),
    studyPlace: "",
    studyPlaceOther: "",
    priorConsulting: { had: "" },
  };
}

export function normalizeHistoryAnswer(raw: unknown): HistoryAnswer {
  if (typeof raw === "string") {
    return { ...emptyHistoryAnswer(), legacyText: raw };
  }
  if (raw && typeof raw === "object") {
    const r = raw as Partial<HistoryAnswer> & { priorConsulting?: unknown };
    const pc = (r.priorConsulting ?? { had: "" }) as Partial<PriorConsulting> & { had?: string };
    let priorConsulting: PriorConsulting;
    if (pc.had === "yes") {
      priorConsulting = {
        had: "yes",
        institution: typeof (pc as { institution?: string }).institution === "string" ? (pc as { institution: string }).institution : "",
        period: typeof (pc as { period?: string }).period === "string" ? (pc as { period: string }).period : "",
        satisfaction: typeof (pc as { satisfaction?: number }).satisfaction === "number" ? (pc as { satisfaction: number }).satisfaction : 0,
      };
    } else if (pc.had === "no") {
      priorConsulting = { had: "no" };
    } else {
      priorConsulting = { had: "" };
    }
    return {
      priorEducation: Array.isArray(r.priorEducation) && r.priorEducation.length > 0
        ? r.priorEducation.map((p) => ({
            institution: typeof p?.institution === "string" ? p.institution : "",
            periodFrom: typeof p?.periodFrom === "string" ? p.periodFrom : "",
            periodTo: typeof p?.periodTo === "string" ? p.periodTo : "",
            subjects: Array.isArray(p?.subjects) ? p.subjects : [],
            subjectOther: typeof p?.subjectOther === "string" ? p.subjectOther : "",
            format: (p?.format ?? "") as HistoryFormat,
            quitReason: typeof p?.quitReason === "string" ? p.quitReason : "",
          }))
        : [emptyPriorEducation()],
      hasPriorEducation: r.hasPriorEducation === "yes" || r.hasPriorEducation === "no" ? r.hasPriorEducation : "",
      currentMix: {
        school: typeof r.currentMix?.school === "number" ? r.currentMix.school : 0,
        academy: typeof r.currentMix?.academy === "number" ? r.currentMix.academy : 0,
        online: typeof r.currentMix?.online === "number" ? r.currentMix.online : 0,
        selfStudy: typeof r.currentMix?.selfStudy === "number" ? r.currentMix.selfStudy : 0,
      },
      studyPlace: (HISTORY_PLACE_OPTIONS as readonly string[]).includes(r.studyPlace ?? "") ? (r.studyPlace as HistoryAnswer["studyPlace"]) : "",
      studyPlaceOther: typeof r.studyPlaceOther === "string" ? r.studyPlaceOther : "",
      priorConsulting,
      legacyText: typeof r.legacyText === "string" ? r.legacyText : undefined,
    };
  }
  return emptyHistoryAnswer();
}

export function isHistoryComplete(answer: HistoryAnswer): boolean {
  // priorEducation: hasPriorEducation === "no" 면 스킵, "yes" 면 row 1+ 모두 채워야
  if (!answer.hasPriorEducation) return false;
  if (answer.hasPriorEducation === "yes") {
    if (answer.priorEducation.length === 0) return false;
    for (const p of answer.priorEducation) {
      if (!p.institution.trim() || !p.periodFrom || !p.periodTo) return false;
      if (!p.format) return false;
      if (!p.quitReason.trim()) return false;
      if (p.subjects.length === 0) return false;
      if (p.subjects.includes("기타") && !p.subjectOther?.trim()) return false;
    }
  }
  // currentMix: 합 100
  const mixSum = answer.currentMix.school + answer.currentMix.academy + answer.currentMix.online + answer.currentMix.selfStudy;
  if (mixSum !== 100) return false;
  // studyPlace: 선택 + "기타" 시 other 필수
  if (!answer.studyPlace) return false;
  if (answer.studyPlace === "기타" && !answer.studyPlaceOther?.trim()) return false;
  // priorConsulting: 라디오 선택 + yes 시 모든 필드
  if (answer.priorConsulting.had === "") return false;
  if (answer.priorConsulting.had === "yes") {
    if (!answer.priorConsulting.institution.trim()) return false;
    if (!answer.priorConsulting.period.trim()) return false;
    if (answer.priorConsulting.satisfaction < 1 || answer.priorConsulting.satisfaction > 5) return false;
  }
  return true;
}

// ─────────────── Q2 (goals) 답변 스키마 ───────────────

export const GOALS_TRACK_OPTIONS = [
  { value: "학종", label: "학종" },
  { value: "교과", label: "교과" },
  { value: "정시", label: "정시" },
  { value: "논술", label: "논술" },
] as const;

export const GOALS_FIT_OPTIONS = [
  { value: "적정", label: "적정" },
  { value: "소신", label: "소신" },
  { value: "안정", label: "안정" },
] as const;

export const GOALS_PRIORITY_AXIS_OPTIONS = [
  { value: "department", label: "학과 우선" },
  { value: "university", label: "대학 우선" },
  { value: "noCompromise", label: "둘 다 양보 불가" },
] as const;

export const GOALS_CAREER_ALIGNMENT_OPTIONS = [
  { value: "match", label: "일치" },
  { value: "partial", label: "부분 일치" },
  { value: "undecided", label: "진로 미정" },
] as const;

export const ASPIRATION_LABELS = ["1지망", "2지망", "3지망"] as const;

export type GoalsTrack = "" | "학종" | "교과" | "정시" | "논술";
export type GoalsFit = "" | "적정" | "소신" | "안정";

export type Aspiration = {
  university: string;
  department: string;
  track: GoalsTrack;
  fit: GoalsFit;
  reason: string;
};

export type GoalsAnswer = {
  aspirations: Aspiration[]; // 항상 3개 (1·2·3지망)
  priorityAxis: "" | "department" | "university" | "noCompromise";
  careerAlignment: "" | "match" | "partial" | "undecided";
  legacyText?: string;
};

export function emptyAspiration(): Aspiration {
  return { university: "", department: "", track: "", fit: "", reason: "" };
}
export function emptyGoalsAnswer(): GoalsAnswer {
  return {
    aspirations: [emptyAspiration(), emptyAspiration(), emptyAspiration()],
    priorityAxis: "",
    careerAlignment: "",
  };
}

export function normalizeGoalsAnswer(raw: unknown): GoalsAnswer {
  if (typeof raw === "string") {
    return { ...emptyGoalsAnswer(), legacyText: raw };
  }
  if (raw && typeof raw === "object") {
    const r = raw as Partial<GoalsAnswer>;
    const aspirations: Aspiration[] = [];
    for (let i = 0; i < 3; i++) {
      const a = Array.isArray(r.aspirations) ? r.aspirations[i] : null;
      aspirations.push({
        university: typeof a?.university === "string" ? a.university : "",
        department: typeof a?.department === "string" ? a.department : "",
        track: (a?.track ?? "") as GoalsTrack,
        fit: (a?.fit ?? "") as GoalsFit,
        reason: typeof a?.reason === "string" ? a.reason : "",
      });
    }
    return {
      aspirations,
      priorityAxis:
        r.priorityAxis === "department" || r.priorityAxis === "university" || r.priorityAxis === "noCompromise"
          ? r.priorityAxis
          : "",
      careerAlignment:
        r.careerAlignment === "match" || r.careerAlignment === "partial" || r.careerAlignment === "undecided"
          ? r.careerAlignment
          : "",
      legacyText: typeof r.legacyText === "string" ? r.legacyText : undefined,
    };
  }
  return emptyGoalsAnswer();
}

export function isGoalsComplete(answer: GoalsAnswer): boolean {
  for (const a of answer.aspirations) {
    if (!a.university.trim()) return false;
    if (!a.department.trim()) return false;
    if (!a.track) return false;
    if (!a.fit) return false;
    if (!a.reason.trim()) return false;
  }
  if (!answer.priorityAxis) return false;
  if (!answer.careerAlignment) return false;
  return true;
}

// ─────────────── 섹션 정의 ───────────────

export const SURVEY_SECTIONS: readonly SurveySection[] = [
  {
    kind: "history",
    key: "history",
    title: "학습 이력",
    description:
      "이전에 다녔던 학원·과외·인강과 현재 학습 환경을 항목별로 입력해 주세요. 학습 시간 분배(학교·학원·인강·자기주도)는 합이 100%가 되어야 합니다.",
  },
  {
    kind: "goals",
    key: "goals",
    title: "목표 대학·학과",
    description:
      "1·2·3지망 대학·학과를 모두 채워 주세요. 우선순위 축(학과/대학/노양보)과 진로 일치 여부도 함께 골라 주세요.",
  },
  {
    kind: "text",
    key: "admissionType",
    title: "희망 지원 전형",
    description:
      "수시 학생부종합·학생부교과·정시 중 어느 쪽을 주력으로 준비할 예정인가요? 현재 내신·모의고사 대비 판단 근거도 함께 적어 주세요.",
    placeholder:
      "예) 수시 학종 주력. 내신 1.8 / 모의고사 2~3등급 편차. 교과 전형은 어렵고 학종으로 생기부 강점 살릴 예정.",
  },
  {
    kind: "text",
    key: "strengthsWeaknesses",
    title: "강점·약점",
    description:
      "과목별 강점과 약점, 학습 습관이나 집중력 측면에서 스스로 인식하는 특징을 적어 주세요.",
    placeholder:
      "예) 수학 강함(모의 1등급). 국어 비문학 약함. 영어는 문법은 자신 있는데 듣기에서 집중 흐트러짐. 저녁 시간대 집중력 하락...",
  },
  {
    kind: "performance",
    key: "performance",
    title: "수행평가 및 교과 활동",
    description:
      "과목별 탐구 경험, 교과 연계 독서, 진로 탐색 수준, 활동 결과물을 항목별로 입력해 주세요. 컨설턴트가 학습 계획 수립 시 가장 중요하게 참고합니다.",
  },
  {
    kind: "text",
    key: "schedule",
    title: "주간 학습 가능 시간",
    description:
      "요일·시간대별로 학습에 투자할 수 있는 시간과 외부 일정(학원·알바 등)을 적어 주세요.",
    placeholder:
      "예) 월~금 19~23시 집에서 자습. 토요일 종일 가능. 일요일 오전 교회. 화·목 저녁 수학 학원 19~21시.",
  },
  {
    kind: "text",
    key: "freeform",
    title: "자유 기술",
    description:
      "컨설턴트·관리멘토에게 미리 알리고 싶은 내용이 있다면 자유롭게 적어 주세요.",
    placeholder:
      "예) 밤 늦게 연락 오는 건 부담스러움. 수학 심화 문제집 풀이 방향 상담 필요. 부모님과는 성적 얘기 민감...",
  },
] as const;

// ─────────────── 통합 헬퍼 ───────────────

/** sections JSON 의 안전한 기본값. kind 별로 빈 값 채움. */
export function emptySurveySections(): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const s of SURVEY_SECTIONS) {
    if (s.kind === "text") {
      result[s.key] = { answer: "" };
    } else if (s.kind === "performance") {
      result[s.key] = emptyPerformanceAnswer();
    } else if (s.kind === "history") {
      result[s.key] = emptyHistoryAnswer();
    } else if (s.kind === "goals") {
      result[s.key] = emptyGoalsAnswer();
    }
  }
  return result;
}

/** 섹션별 기존 답변 정규화 (legacy → 신규 shape). */
export function normalizeSectionValue(section: SurveySection, raw: unknown): unknown {
  if (section.kind === "text") {
    if (raw && typeof raw === "object" && "answer" in raw) return raw;
    if (typeof raw === "string") return { answer: raw };
    return { answer: "" };
  }
  if (section.kind === "performance") {
    return normalizePerformanceAnswer(raw && typeof raw === "object" && "answer" in raw
      // text section legacy migration: { answer: "..." } → use as legacyText
      ? (raw as { answer: unknown }).answer
      : raw);
  }
  if (section.kind === "history") {
    return normalizeHistoryAnswer(raw && typeof raw === "object" && "answer" in raw
      ? (raw as { answer: unknown }).answer
      : raw);
  }
  if (section.kind === "goals") {
    return normalizeGoalsAnswer(raw && typeof raw === "object" && "answer" in raw
      ? (raw as { answer: unknown }).answer
      : raw);
  }
  return raw;
}

/** 섹션이 완료된 상태인지 (kind 별 분기). */
export function isSectionComplete(section: SurveySection, value: unknown): boolean {
  if (section.kind === "text") {
    const a = (value as { answer?: string } | null)?.answer;
    return typeof a === "string" && a.trim().length > 0;
  }
  if (section.kind === "performance") {
    return isPerformanceComplete(normalizePerformanceAnswer(value));
  }
  if (section.kind === "history") {
    return isHistoryComplete(normalizeHistoryAnswer(value));
  }
  if (section.kind === "goals") {
    return isGoalsComplete(normalizeGoalsAnswer(value));
  }
  return false;
}

/** 섹션별 작성 상태. 모든 섹션이 complete 면 true. */
export function isSurveyComplete(sections: unknown): boolean {
  if (!sections || typeof sections !== "object") return false;
  const s = sections as Record<string, unknown>;
  return SURVEY_SECTIONS.every((section) => isSectionComplete(section, s[section.key]));
}
