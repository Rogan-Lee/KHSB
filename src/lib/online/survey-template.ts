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

export type SurveySection = TextSection | PerformanceSection;

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

// ─────────────── 섹션 정의 ───────────────

export const SURVEY_SECTIONS: readonly SurveySection[] = [
  {
    kind: "text",
    key: "history",
    title: "학습 이력",
    description:
      "이전에 다녔던 학원·과외·인강 등 학습 경험과 현재 학습 환경을 자유롭게 적어 주세요.",
    placeholder:
      "예) 중3까지 메가스터디 수학 들었음. 고1부터는 자습 위주. 현재는 국어 독학...",
  },
  {
    kind: "text",
    key: "goals",
    title: "목표 대학·학과",
    description:
      "가장 희망하는 대학·학과와 차선책을 적어 주세요. 구체적일수록 좋습니다.",
    placeholder:
      "예) 1지망: 서울대 경영학과 / 2지망: 연세대 경제학부 / 3지망: 고려대 경영대학",
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
  return false;
}

/** 섹션별 작성 상태. 모든 섹션이 complete 면 true. */
export function isSurveyComplete(sections: unknown): boolean {
  if (!sections || typeof sections !== "object") return false;
  const s = sections as Record<string, unknown>;
  return SURVEY_SECTIONS.every((section) => isSectionComplete(section, s[section.key]));
}
