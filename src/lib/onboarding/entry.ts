// 입실 준비 — 새로 입실한 학생이 앱에서 내는 것 (원장님 요청 2026-11)
//   1) 등원·학원 일정(입퇴실표 + 다니는 학원 요일·시간)  2) 성적(모의고사·내신, 국수영사과)  3) 멘토 매칭 설문
// 첫 로그인 때 안내하고 건너뛸 수 있다. 다 낼 때까지 학생 홈 위에 카드가 남는다.
//
// 저장: 등원·학원 일정은 기존 ScheduleProposal(앱 "내 일정 → 등원 스케줄", 학원은 "학원·외출 일정"), 성적은 ExamScore 에 바로 반영.
// 성적 원본·멘토 설문은 OnboardingSurvey.sections 의 entry* 키에 둔다.
// ponytail: 온라인 컨설팅 설문 테이블을 같이 쓴다(DB 구조 변경 없이). 온라인 설문 키와 겹치지 않게 entry 접두.
//           항목이 늘거나 운영진 검색이 필요해지면 전용 테이블로 옮긴다.
//
// 앱(apps/mobile/src/lib/api/student-onboarding.ts)에 아래 타입·상수를 복사해 둔다. 고치면 둘 다 고친다.

/** 이 날(KST) 이후 만든 학생 계정에만 안내한다 — 기존 학생에겐 띄우지 않는다 (배포가 늦어지면 그 사이 가입한 새 학생도 안내받는 게 맞다) */
export const ENTRY_SINCE = "2026-11-24";

export const ENTRY_STEPS = ["schedule", "grades", "mentor"] as const;
export type EntryStepKey = (typeof ENTRY_STEPS)[number];
export const ENTRY_STEP_LABEL: Record<EntryStepKey, string> = {
  schedule: "등원·학원 일정",
  grades: "성적",
  mentor: "멘토 매칭 설문",
};

// ─── 성적 ─────────────────────────────────────────────────────────────

export const GRADE_SUBJECTS = ["국어", "수학", "영어", "사회", "과학"] as const;
export type GradeSubject = (typeof GRADE_SUBJECTS)[number];
/** 등급 1~9. null = 안 봤거나 모름 */
export type SubjectGrades = Partial<Record<GradeSubject, number | null>>;

export type EntryGrades = {
  /** 가장 최근 모의고사. null = 본 적 없음 */
  mock: { examName: string; scores: SubjectGrades } | null;
  /** 가장 최근 내신. null = 아직 없음(예: 고1 1학기 전) */
  school: { term: string; scores: SubjectGrades } | null;
};

/** ExamScore.notes 표시 — 다시 내면 이 표시가 붙은 행만 지우고 새로 넣는다 */
export const ENTRY_SCORE_NOTE = "학생 입력 (입실 준비)";

// ─── 멘토 매칭 설문 ───────────────────────────────────────────────────

export type MentorQuestion = {
  key: string;
  title: string;
  kind: "single" | "multi" | "text";
  options?: string[];
  /** 선택지 아래 작은 설명 (선택지 문구 → 설명) */
  hints?: Record<string, string>;
  required: boolean;
  placeholder?: string;
};
export type EntryMentor = Record<string, string | string[]>;

/** 원장님 자료 "멘토 매칭을 위한 학습 성향 및 선호 스타일 조사 항목 예시" (2026-11-24) */
export const MENTOR_QUESTIONS: MentorQuestion[] = [
  {
    key: "style",
    title: "어떤 스타일의 멘토와 함께할 때 가장 몰입이 잘 될 것 같나요? (여러 개)",
    kind: "multi",
    options: ["팩트 중심·체계형", "동기부여·공감형", "전략·솔루션형"],
    hints: {
      "팩트 중심·체계형": "엄격하고 명확하게 피드백을 주고, 계획을 지켰는지 철저히 점검해 주는 스타일",
      "동기부여·공감형": "멘탈 케어와 따뜻한 격려로 자존감을 올려 주는 스타일",
      "전략·솔루션형": "공부 방법, 과목별 균형, 입시 전략 중심으로 현실적인 팁을 주는 스타일",
    },
    required: true,
  },
  {
    key: "feedback",
    title: "피드백을 받을 때 어떤 분위기가 좋나요?",
    kind: "single",
    options: ["직설적 피드백", "부드러운 피드백"],
    hints: {
      "직설적 피드백": "개선점과 부족한 부분을 바로 짚어 주는 게 좋아요",
      "부드러운 피드백": "잘한 점을 먼저 듣고, 개선점은 부드럽게 안내받는 게 좋아요",
    },
    required: true,
  },
  {
    key: "lead",
    title: "주간 계획 작성이나 교재 선택은 어떻게 하고 싶나요?",
    kind: "single",
    options: ["멘토 주도형", "상호 협의형", "학생 주도형"],
    hints: {
      "멘토 주도형": "멘토가 교재, 분량, 주간 계획을 구체적으로 정해 줘요",
      "상호 협의형": "내 의견을 바탕으로 멘토와 상의해서 정해요",
      "학생 주도형": "내가 짠 계획을 멘토가 점검하고 보완만 해 줘요",
    },
    required: true,
  },
  {
    key: "mentorTrack",
    title: "어떤 멘토와 매칭되면 좋겠나요?",
    kind: "single",
    options: ["희망 전공 계열이 같은 멘토", "준비하는 전형으로 합격한 멘토", "상관없음"],
    hints: {
      "희망 전공 계열이 같은 멘토": "의치약한, 공대, 인문, 상경 등 내가 목표로 하는 계열",
      "준비하는 전형으로 합격한 멘토": "학종, 교과, 정시 등 내가 준비하는 전형으로 합격한 멘토",
      상관없음: "계열보다 성향과 지도 스타일이 더 중요해요",
    },
    required: true,
  },
  {
    key: "needs",
    title: "멘토링으로 가장 크게 개선하고 싶은 점은 무엇인가요? (여러 개)",
    kind: "multi",
    options: [
      "주간·일간 학습 계획 세우기와 플래너 작성법",
      "과목별 효율적인 공부법과 교재·인강 추천",
      "슬럼프 극복과 멘탈·수면 관리",
      "모의고사 복기와 오답 정리 방법",
      "순공 시간 확보와 집중력 유지",
    ],
    required: true,
  },
  {
    key: "memo",
    title: "멘토 매칭 때 참고할 나의 특성이나 바라는 점이 있다면 적어 주세요",
    kind: "text",
    required: false,
    placeholder: "예: 하위권에서 상위권까지 성적을 올려 본 멘토, 재수 경험이 있는 멘토",
  },
];

// ─── 저장 위치 (OnboardingSurvey.sections) ────────────────────────────

export const ENTRY_SECTION_KEY = {
  grades: "entryGrades",
  mentor: "entryMentor",
} as const;
/** 저장 값 = 페이로드 + savedAt(ISO) */
export type Saved<T> = T & { savedAt: string };

// ─── 모바일 API ───────────────────────────────────────────────────────
// GET /api/mobile/v1/student/onboarding            → EntryOnboardingResponse
// PUT /api/mobile/v1/student/onboarding/grades     body EntryGrades           → EntryOnboardingResponse
// PUT /api/mobile/v1/student/onboarding/mentor     body { answers: EntryMentor } → EntryOnboardingResponse
// 잘못된 값은 400 + 한국어 문구 (MobileApiError → mobileApiErrorResponse 형식).
// 등원·학원 일정은 기존 POST /api/mobile/v1/student/schedule/proposals 로 내고, 앱 경로는 '/(student)/schedule?tab=submit'.

export type EntryOnboardingResponse = {
  /** 안내 대상(ENTRY_SINCE 이후 만든 계정이고 남은 단계가 있음). false 면 앱은 카드도 자동 열기도 하지 않는다 */
  show: boolean;
  steps: { key: EntryStepKey; label: string; done: boolean }[];
  /** 가장 최근 등원 스케줄 제출 (없으면 null) */
  schedule: { submittedAt: string; status: string } | null;
  grades: Saved<EntryGrades> | null;
  mentor: { questions: MentorQuestion[]; answers: Saved<{ answers: EntryMentor }> | null };
};
