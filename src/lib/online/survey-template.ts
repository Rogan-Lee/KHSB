// 온보딩 설문 섹션 템플릿 (Phase 1 고정).
// sections JSON 의 키는 section.key 기준. 값은 { answer: string } 구조.
// Phase 2 에서 컨설턴트가 학생별 커스터마이즈 가능하도록 확장.

export type SurveySection = {
  key: string;
  title: string;
  description: string;
  placeholder: string;
};

export const SURVEY_SECTIONS: readonly SurveySection[] = [
  {
    key: "history",
    title: "학습 이력",
    description:
      "이전에 다녔던 학원·과외·인강 등 학습 경험과 현재 학습 환경을 자유롭게 적어 주세요.",
    placeholder:
      "예) 중3까지 메가스터디 수학 들었음. 고1부터는 자습 위주. 현재는 국어 독학...",
  },
  {
    key: "goals",
    title: "목표 대학·학과",
    description:
      "가장 희망하는 대학·학과와 차선책을 적어 주세요. 구체적일수록 좋습니다.",
    placeholder:
      "예) 1지망: 서울대 경영학과 / 2지망: 연세대 경제학부 / 3지망: 고려대 경영대학",
  },
  {
    key: "admissionType",
    title: "희망 지원 전형",
    description:
      "수시 학생부종합·학생부교과·정시 중 어느 쪽을 주력으로 준비할 예정인가요? 현재 내신·모의고사 대비 판단 근거도 함께 적어 주세요.",
    placeholder:
      "예) 수시 학종 주력. 내신 1.8 / 모의고사 2~3등급 편차. 교과 전형은 어렵고 학종으로 생기부 강점 살릴 예정.",
  },
  {
    key: "strengthsWeaknesses",
    title: "강점·약점",
    description:
      "과목별 강점과 약점, 학습 습관이나 집중력 측면에서 스스로 인식하는 특징을 적어 주세요.",
    placeholder:
      "예) 수학 강함(모의 1등급). 국어 비문학 약함. 영어는 문법은 자신 있는데 듣기에서 집중 흐트러짐. 저녁 시간대 집중력 하락...",
  },
  {
    key: "performance",
    title: "수행평가 이수 현황",
    description:
      "현재 진행 중이거나 마감 임박한 수행평가를 과목별로 나열해 주세요. 수행평가 관리 시스템에 등록할 기준이 됩니다.",
    placeholder:
      "예) 국어 - 독서 감상문(5/20 마감). 영어 - 스피치 영상(5/15). 사회 - 조별 발표자료 제작(5/30)...",
  },
  {
    key: "schedule",
    title: "주간 학습 가능 시간",
    description:
      "요일·시간대별로 학습에 투자할 수 있는 시간과 외부 일정(학원·알바 등)을 적어 주세요.",
    placeholder:
      "예) 월~금 19~23시 집에서 자습. 토요일 종일 가능. 일요일 오전 교회. 화·목 저녁 수학 학원 19~21시.",
  },
  {
    key: "freeform",
    title: "자유 기술",
    description:
      "컨설턴트·관리멘토에게 미리 알리고 싶은 내용이 있다면 자유롭게 적어 주세요.",
    placeholder:
      "예) 밤 늦게 연락 오는 건 부담스러움. 수학 심화 문제집 풀이 방향 상담 필요. 부모님과는 성적 얘기 민감...",
  },
] as const;

/** sections JSON 의 안전한 기본값. */
export function emptySurveySections(): Record<string, { answer: string }> {
  return Object.fromEntries(
    SURVEY_SECTIONS.map((s) => [s.key, { answer: "" }])
  );
}

/** 섹션별 작성 상태. 모든 섹션에 내용이 있으면 true. */
export function isSurveyComplete(sections: unknown): boolean {
  if (!sections || typeof sections !== "object") return false;
  const s = sections as Record<string, { answer?: string }>;
  return SURVEY_SECTIONS.every((section) => {
    const answer = s[section.key]?.answer;
    return typeof answer === "string" && answer.trim().length > 0;
  });
}
