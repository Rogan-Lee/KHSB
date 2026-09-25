/**
 * 초기 설문 — 서버 `src/lib/online/survey-template.ts` 의 클라이언트 미러.
 * 데이터 shape · 옵션 · 정규화 · 완료 규칙을 서버와 똑같이 유지한다.
 * 최종 판정(complete 플래그)은 서버가 내려주고, 여기 완료 규칙은 화면 안내("남은 항목")용이다.
 */

export type SurveyKind =
  | 'text'
  | 'performance'
  | 'history'
  | 'goals'
  | 'admissionType'
  | 'strengthsWeaknesses';

export type Option<T extends string = string> = { value: T; label: string };

const asOptions = <T extends string>(values: readonly T[]): Option<T>[] =>
  values.map((v) => ({ value: v, label: v }));

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const strArr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

// ─── text ────────────────────────────────────────────────────────────

export type TextAnswer = { answer: string };

// ─── performance (수행평가 및 교과 활동) ─────────────────────────────

export const PERFORMANCE_METHOD_OPTIONS = ['실험', '자료분석', '토론', '발표', '프로젝트', '기타'] as const;
export const PERFORMANCE_OUTPUT_OPTIONS = ['보고서', '발표자료', '영상', '코드', '실험결과', '기타'] as const;

export type CareerLevel = '' | 'interested' | 'exploring' | 'specified';
export const CAREER_LEVELS: Option<Exclude<CareerLevel, ''>>[] = [
  { value: 'interested', label: '관심 있음' },
  { value: 'exploring', label: '탐색 중' },
  { value: 'specified', label: '구체화됨' },
];

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
  careerLevel: CareerLevel;
  careerDetail: string;
  outputs: string[];
  outputOther?: string;
  legacyText?: string;
};

export const emptyPerformanceSubject = (): PerformanceSubject => ({
  subject: '',
  topic: '',
  methods: [],
  methodOther: '',
  selfRole: '',
});
export const emptyPerformanceBook = (): PerformanceBook => ({
  title: '',
  reason: '',
  linkedSubject: '',
  expansion: '',
});
export const emptyPerformanceAnswer = (): PerformanceAnswer => ({
  subjects: [emptyPerformanceSubject()],
  books: [emptyPerformanceBook()],
  careerLevel: '',
  careerDetail: '',
  outputs: [],
  outputOther: '',
});

export function normalizePerformanceAnswer(raw: unknown): PerformanceAnswer {
  if (typeof raw === 'string') return { ...emptyPerformanceAnswer(), legacyText: raw };
  if (!isObj(raw)) return emptyPerformanceAnswer();
  const subjects = Array.isArray(raw.subjects)
    ? raw.subjects.filter(isObj).map((s) => ({
        subject: str(s.subject),
        topic: str(s.topic),
        methods: strArr(s.methods),
        methodOther: str(s.methodOther),
        selfRole: str(s.selfRole),
      }))
    : [];
  const books = Array.isArray(raw.books)
    ? raw.books.filter(isObj).map((b) => ({
        title: str(b.title),
        reason: str(b.reason),
        linkedSubject: str(b.linkedSubject),
        expansion: str(b.expansion),
      }))
    : [];
  const level = raw.careerLevel;
  return {
    subjects: subjects.length ? subjects : [emptyPerformanceSubject()],
    books: books.length ? books : [emptyPerformanceBook()],
    careerLevel: level === 'interested' || level === 'exploring' || level === 'specified' ? level : '',
    careerDetail: str(raw.careerDetail),
    outputs: strArr(raw.outputs),
    outputOther: str(raw.outputOther),
    legacyText: typeof raw.legacyText === 'string' ? raw.legacyText : undefined,
  };
}

// ─── history (학습 이력) ──────────────────────────────────────────────

export const HISTORY_SUBJECT_OPTIONS = ['국', '수', '영', '사', '과', '기타'] as const;
export type HistoryFormat = '' | '현강' | '인강' | '과외' | '관리형';
export const HISTORY_FORMAT_OPTIONS = asOptions(['현강', '인강', '과외', '관리형'] as const);
export const HISTORY_PLACE_OPTIONS = ['독서실', '집', '학원 자습실', '카페', '학교 야자', '기타'] as const;
export const HISTORY_MIX_KEYS = ['school', 'academy', 'online', 'selfStudy'] as const;
export type StudyMixKey = (typeof HISTORY_MIX_KEYS)[number];
export const HISTORY_MIX_LABELS: Record<StudyMixKey, string> = {
  school: '학교',
  academy: '학원',
  online: '인강',
  selfStudy: '자기주도',
};

export type PriorEducation = {
  institution: string;
  /** YYYY-MM */
  periodFrom: string;
  /** YYYY-MM */
  periodTo: string;
  subjects: string[];
  subjectOther?: string;
  format: HistoryFormat;
  quitReason: string;
};
export type StudyMix = Record<StudyMixKey, number>;
export type PriorConsulting =
  | { had: '' }
  | { had: 'no' }
  | { had: 'yes'; institution: string; period: string; satisfaction: number };
export type HistoryAnswer = {
  priorEducation: PriorEducation[];
  hasPriorEducation: '' | 'yes' | 'no';
  currentMix: StudyMix;
  studyPlace: string;
  studyPlaceOther?: string;
  priorConsulting: PriorConsulting;
  legacyText?: string;
};

export const emptyPriorEducation = (): PriorEducation => ({
  institution: '',
  periodFrom: '',
  periodTo: '',
  subjects: [],
  subjectOther: '',
  format: '',
  quitReason: '',
});
export const emptyHistoryAnswer = (): HistoryAnswer => ({
  priorEducation: [emptyPriorEducation()],
  hasPriorEducation: '',
  currentMix: { school: 0, academy: 0, online: 0, selfStudy: 0 },
  studyPlace: '',
  studyPlaceOther: '',
  priorConsulting: { had: '' },
});

const FORMATS: readonly string[] = ['현강', '인강', '과외', '관리형'];

export function normalizeHistoryAnswer(raw: unknown): HistoryAnswer {
  if (typeof raw === 'string') return { ...emptyHistoryAnswer(), legacyText: raw };
  if (!isObj(raw)) return emptyHistoryAnswer();
  const pc = isObj(raw.priorConsulting) ? raw.priorConsulting : {};
  const priorConsulting: PriorConsulting =
    pc.had === 'yes'
      ? { had: 'yes', institution: str(pc.institution), period: str(pc.period), satisfaction: num(pc.satisfaction) }
      : pc.had === 'no'
        ? { had: 'no' }
        : { had: '' };
  const prior = Array.isArray(raw.priorEducation)
    ? raw.priorEducation.filter(isObj).map((p) => ({
        institution: str(p.institution),
        periodFrom: str(p.periodFrom),
        periodTo: str(p.periodTo),
        subjects: strArr(p.subjects),
        subjectOther: str(p.subjectOther),
        format: (FORMATS.includes(str(p.format)) ? str(p.format) : '') as HistoryFormat,
        quitReason: str(p.quitReason),
      }))
    : [];
  const mix = isObj(raw.currentMix) ? raw.currentMix : {};
  const place = str(raw.studyPlace);
  return {
    priorEducation: prior.length ? prior : [emptyPriorEducation()],
    hasPriorEducation: raw.hasPriorEducation === 'yes' || raw.hasPriorEducation === 'no' ? raw.hasPriorEducation : '',
    currentMix: {
      school: num(mix.school),
      academy: num(mix.academy),
      online: num(mix.online),
      selfStudy: num(mix.selfStudy),
    },
    studyPlace: (HISTORY_PLACE_OPTIONS as readonly string[]).includes(place) ? place : '',
    studyPlaceOther: str(raw.studyPlaceOther),
    priorConsulting,
    legacyText: typeof raw.legacyText === 'string' ? raw.legacyText : undefined,
  };
}

export const mixSum = (m: StudyMix) => m.school + m.academy + m.online + m.selfStudy;

// ─── goals (목표 대학·학과) ───────────────────────────────────────────

export type GoalsTrack = '' | '학종' | '교과' | '정시' | '논술';
export type GoalsFit = '' | '적정' | '소신' | '안정';
export const GOALS_TRACK_OPTIONS = asOptions(['학종', '교과', '정시', '논술'] as const);
export const GOALS_FIT_OPTIONS = asOptions(['적정', '소신', '안정'] as const);
export type PriorityAxis = '' | 'department' | 'university' | 'noCompromise';
export const GOALS_PRIORITY_AXIS_OPTIONS: Option<Exclude<PriorityAxis, ''>>[] = [
  { value: 'department', label: '학과 우선' },
  { value: 'university', label: '대학 우선' },
  { value: 'noCompromise', label: '둘 다 양보 불가' },
];
export type CareerAlignment = '' | 'match' | 'partial' | 'undecided';
export const GOALS_CAREER_ALIGNMENT_OPTIONS: Option<Exclude<CareerAlignment, ''>>[] = [
  { value: 'match', label: '일치' },
  { value: 'partial', label: '부분 일치' },
  { value: 'undecided', label: '진로 미정' },
];
export const ASPIRATION_LABELS = ['1지망', '2지망', '3지망'] as const;

export type Aspiration = {
  university: string;
  department: string;
  track: GoalsTrack;
  fit: GoalsFit;
  reason: string;
};
export type GoalsAnswer = {
  /** 항상 3개 (1·2·3지망) */
  aspirations: Aspiration[];
  priorityAxis: PriorityAxis;
  careerAlignment: CareerAlignment;
  legacyText?: string;
};

export const emptyAspiration = (): Aspiration => ({ university: '', department: '', track: '', fit: '', reason: '' });
export const emptyGoalsAnswer = (): GoalsAnswer => ({
  aspirations: [emptyAspiration(), emptyAspiration(), emptyAspiration()],
  priorityAxis: '',
  careerAlignment: '',
});

export function normalizeGoalsAnswer(raw: unknown): GoalsAnswer {
  if (typeof raw === 'string') return { ...emptyGoalsAnswer(), legacyText: raw };
  if (!isObj(raw)) return emptyGoalsAnswer();
  const list = Array.isArray(raw.aspirations) ? raw.aspirations : [];
  const aspirations = [0, 1, 2].map((i) => {
    const a = isObj(list[i]) ? list[i] : {};
    return {
      university: str(a.university),
      department: str(a.department),
      track: str(a.track) as GoalsTrack,
      fit: str(a.fit) as GoalsFit,
      reason: str(a.reason),
    };
  });
  const axis = raw.priorityAxis;
  const align = raw.careerAlignment;
  return {
    aspirations,
    priorityAxis: axis === 'department' || axis === 'university' || axis === 'noCompromise' ? axis : '',
    careerAlignment: align === 'match' || align === 'partial' || align === 'undecided' ? align : '',
    legacyText: typeof raw.legacyText === 'string' ? raw.legacyText : undefined,
  };
}

// ─── admissionType (희망 지원 전형) ──────────────────────────────────

export const ADMISSION_PRIMARY_TRACK_OPTIONS = asOptions([
  '학종 단일',
  '교과 단일',
  '정시 단일',
  '학종+정시 병행',
  '교과+정시 병행',
] as const);
export const ADMISSION_CSAT_OPTIONS = asOptions(['충족 자신', '빠듯함', '불가', '미적용 전형'] as const);
export const ADMISSION_CARD_TRACK_OPTIONS = asOptions(['학종', '교과', '정시', '논술'] as const);
export const ADMISSION_CARD_FIT_OPTIONS = asOptions(['적정', '소신', '안정'] as const);

export const ALL_INTERNAL_SEMESTERS = ['1-1', '1-2', '2-1', '2-2', '3-1'] as const;
export type InternalSemesterKey = (typeof ALL_INTERNAL_SEMESTERS)[number];
export const INTERNAL_SUBJECT_KEYS = ['국', '수', '영', '탐1', '탐2', '전체'] as const;
export const MOCK_SUBJECT_KEYS = ['국', '수', '영', '탐1', '탐2'] as const;
export const CARD_COUNT = 6;

export type AdmissionCardTrack = '' | '학종' | '교과' | '정시' | '논술';
export type AdmissionCardFit = '' | '적정' | '소신' | '안정';
export type InternalSemester = {
  semester: InternalSemesterKey;
  /** 미진행 또는 미응답 */
  unregistered: boolean;
  grades: Record<string, string>;
};
export type MockExam = {
  label: string;
  unregistered: boolean;
  grades: Record<string, string>;
  percentiles: Record<string, string>;
};
export type AdmissionCard = {
  university: string;
  department: string;
  track: AdmissionCardTrack;
  fit: AdmissionCardFit;
};
export type AdmissionTypeAnswer = {
  primaryTrack: string;
  /** ALL_INTERNAL_SEMESTERS 순서 그대로 5개 */
  internalGrades: InternalSemester[];
  /** 항상 3개 (최근 3회) */
  mockGrades: MockExam[];
  csatMinimum: string;
  /** 항상 6개 (수시 카드) */
  cardStrategy: AdmissionCard[];
  rationale: string;
  legacyText?: string;
};

const gradeMap = (keys: readonly string[], src?: unknown): Record<string, string> => {
  const o = isObj(src) ? src : {};
  return keys.reduce<Record<string, string>>((acc, k) => ({ ...acc, [k]: str(o[k]) }), {});
};
export const emptyMockExam = (): MockExam => ({
  label: '',
  unregistered: false,
  grades: gradeMap(MOCK_SUBJECT_KEYS),
  percentiles: gradeMap(MOCK_SUBJECT_KEYS),
});
export const emptyAdmissionCard = (): AdmissionCard => ({ university: '', department: '', track: '', fit: '' });
export const emptyAdmissionTypeAnswer = (): AdmissionTypeAnswer => ({
  primaryTrack: '',
  internalGrades: ALL_INTERNAL_SEMESTERS.map((semester) => ({
    semester,
    unregistered: false,
    grades: gradeMap(INTERNAL_SUBJECT_KEYS),
  })),
  mockGrades: [emptyMockExam(), emptyMockExam(), emptyMockExam()],
  csatMinimum: '',
  cardStrategy: Array.from({ length: CARD_COUNT }, emptyAdmissionCard),
  rationale: '',
});

export function normalizeAdmissionTypeAnswer(raw: unknown): AdmissionTypeAnswer {
  if (typeof raw === 'string') return { ...emptyAdmissionTypeAnswer(), legacyText: raw };
  if (!isObj(raw)) return emptyAdmissionTypeAnswer();
  const internal = Array.isArray(raw.internalGrades) ? raw.internalGrades.filter(isObj) : [];
  const mocks = Array.isArray(raw.mockGrades) ? raw.mockGrades : [];
  const cards = Array.isArray(raw.cardStrategy) ? raw.cardStrategy : [];
  return {
    primaryTrack: str(raw.primaryTrack),
    internalGrades: ALL_INTERNAL_SEMESTERS.map((semester) => {
      const found = internal.find((g) => g.semester === semester);
      return { semester, unregistered: !!found?.unregistered, grades: gradeMap(INTERNAL_SUBJECT_KEYS, found?.grades) };
    }),
    mockGrades: [0, 1, 2].map((i) => {
      const m = isObj(mocks[i]) ? mocks[i] : {};
      return {
        label: str(m.label),
        unregistered: !!m.unregistered,
        grades: gradeMap(MOCK_SUBJECT_KEYS, m.grades),
        percentiles: gradeMap(MOCK_SUBJECT_KEYS, m.percentiles),
      };
    }),
    csatMinimum: str(raw.csatMinimum),
    cardStrategy: Array.from({ length: CARD_COUNT }, (_, i) => {
      const c = isObj(cards[i]) ? cards[i] : {};
      return {
        university: str(c.university),
        department: str(c.department),
        track: str(c.track) as AdmissionCardTrack,
        fit: str(c.fit) as AdmissionCardFit,
      };
    }),
    rationale: str(raw.rationale),
    legacyText: typeof raw.legacyText === 'string' ? raw.legacyText : undefined,
  };
}

export type SemesterStatus = 'completed' | 'ongoing' | 'future';

/** KST 기준 현재 월 (1–12) */
export function currentMonthKST(now = new Date()): number {
  const m = Number(now.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }).slice(5, 7));
  return Number.isFinite(m) && m >= 1 && m <= 12 ? m : now.getMonth() + 1;
}

/** 학년·학사일정 기반 노출 학기 분류 (서버 classifyInternalSemesters 미러: 3~8월 1학기, 9~2월 2학기). */
export function classifyInternalSemesters(
  gradeNumber: 1 | 2 | 3 | null,
  month = currentMonthKST(),
): { semester: InternalSemesterKey; status: SemesterStatus }[] {
  if (!gradeNumber) return ALL_INTERNAL_SEMESTERS.map((semester) => ({ semester, status: 'ongoing' }));
  const term: 1 | 2 = month >= 3 && month <= 8 ? 1 : 2;
  return ALL_INTERNAL_SEMESTERS.map((semester) => {
    const [y, t] = semester.split('-').map(Number);
    const status: SemesterStatus =
      y < gradeNumber ? 'completed' : y > gradeNumber ? 'future' : t < term ? 'completed' : t === term ? 'ongoing' : 'future';
    return { semester, status };
  });
}

export function semesterLabel(sem: InternalSemesterKey) {
  const [y, t] = sem.split('-');
  return `${y}학년 ${t}학기`;
}

export const isCardFilled = (c: AdmissionCard) => !!(c.university.trim() || c.department.trim() || c.track || c.fit);

// ─── strengthsWeaknesses (강점·약점) ─────────────────────────────────

export type SwLevel = '' | '강' | '중' | '약';
export const SW_LEVEL_OPTIONS = asOptions(['강', '중', '약'] as const);
export const SW_WEAK_AREA_OPTIONS = ['개념', '계산', '서술형', '킬러문항', '시간 부족', '기타'] as const;
export const SW_HABIT_OPTIONS = [
  '계획형',
  '즉흥형',
  '미루기',
  '복습 안 함',
  '오답노트 작성',
  '벼락치기',
  '인강 누적 시청',
] as const;

export type SubjectStrength = {
  subject: string;
  level: SwLevel;
  internalGrade: string;
  mockGrade: string;
  weakAreas: string[];
  weakAreaOther?: string;
  reason: string;
};
export type StrengthsWeaknessesAnswer = {
  bySubject: SubjectStrength[];
  studyHabits: string[];
  focusMinutes: string;
  /** 1–5, 0 = 미선택 */
  testAnxiety: number;
  /** 1–5, 0 = 미선택 */
  selfDirection: number;
  legacyText?: string;
};

export const emptySubjectStrength = (): SubjectStrength => ({
  subject: '',
  level: '',
  internalGrade: '',
  mockGrade: '',
  weakAreas: [],
  weakAreaOther: '',
  reason: '',
});
export const emptyStrengthsWeaknessesAnswer = (): StrengthsWeaknessesAnswer => ({
  bySubject: [emptySubjectStrength()],
  studyHabits: [],
  focusMinutes: '',
  testAnxiety: 0,
  selfDirection: 0,
});

const LEVELS: readonly string[] = ['강', '중', '약'];

export function normalizeStrengthsWeaknessesAnswer(raw: unknown): StrengthsWeaknessesAnswer {
  if (typeof raw === 'string') return { ...emptyStrengthsWeaknessesAnswer(), legacyText: raw };
  if (!isObj(raw)) return emptyStrengthsWeaknessesAnswer();
  const subjects = Array.isArray(raw.bySubject)
    ? raw.bySubject.filter(isObj).map((s) => ({
        subject: str(s.subject),
        level: (LEVELS.includes(str(s.level)) ? str(s.level) : '') as SwLevel,
        internalGrade: str(s.internalGrade),
        mockGrade: str(s.mockGrade),
        weakAreas: strArr(s.weakAreas),
        weakAreaOther: str(s.weakAreaOther),
        reason: str(s.reason),
      }))
    : [];
  return {
    bySubject: subjects.length ? subjects : [emptySubjectStrength()],
    studyHabits: strArr(raw.studyHabits),
    focusMinutes: str(raw.focusMinutes),
    testAnxiety: num(raw.testAnxiety),
    selfDirection: num(raw.selfDirection),
    legacyText: typeof raw.legacyText === 'string' ? raw.legacyText : undefined,
  };
}

// ─── 공통: 정규화 · 빈 값 · 남은 항목 ────────────────────────────────

export type SurveyAnswer =
  | TextAnswer
  | PerformanceAnswer
  | HistoryAnswer
  | GoalsAnswer
  | AdmissionTypeAnswer
  | StrengthsWeaknessesAnswer;

/** 서버가 내려준 값(unknown)을 kind 에 맞는 안전한 shape 로 */
export function normalizeSectionValue(kind: SurveyKind, raw: unknown): SurveyAnswer {
  const inner = isObj(raw) && 'answer' in raw && kind !== 'text' ? raw.answer : raw;
  switch (kind) {
    case 'text':
      return { answer: isObj(raw) ? str(raw.answer) : str(raw) };
    case 'performance':
      return normalizePerformanceAnswer(inner);
    case 'history':
      return normalizeHistoryAnswer(inner);
    case 'goals':
      return normalizeGoalsAnswer(inner);
    case 'admissionType':
      return normalizeAdmissionTypeAnswer(inner);
    case 'strengthsWeaknesses':
      return normalizeStrengthsWeaknessesAnswer(inner);
  }
}

function emptyAnswer(kind: SurveyKind): SurveyAnswer {
  switch (kind) {
    case 'text':
      return { answer: '' };
    case 'performance':
      return emptyPerformanceAnswer();
    case 'history':
      return emptyHistoryAnswer();
    case 'goals':
      return emptyGoalsAnswer();
    case 'admissionType':
      return emptyAdmissionTypeAnswer();
    case 'strengthsWeaknesses':
      return emptyStrengthsWeaknessesAnswer();
  }
}

/** 아무것도 적지 않은 상태인지 (남은 항목 안내를 띄울지 판단) */
export function isBlankAnswer(kind: SurveyKind, value: SurveyAnswer): boolean {
  return JSON.stringify(normalizeSectionValue(kind, value)) === JSON.stringify(emptyAnswer(kind));
}

const blank = (s: string | undefined) => !s || !s.trim();

/** 1–9 등급 (소수 허용) */
export const isValidGrade = (s: string) => {
  const n = Number(s);
  return s.trim() !== '' && Number.isFinite(n) && n >= 1 && n <= 9;
};
/** 0–100 백분위 */
export const isValidPercentile = (s: string) => {
  const n = Number(s);
  return s.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 100;
};

/**
 * 아직 채우지 않은 항목 — 서버 is*Complete 와 같은 규칙. 빈 배열이면 작성 완료.
 * 문구는 화면의 필드 라벨과 맞춘다.
 */
export function sectionIssues(
  kind: SurveyKind,
  value: SurveyAnswer,
  gradeNumber: 1 | 2 | 3 | null,
): string[] {
  const out: string[] = [];
  const need = (cond: boolean, label: string) => {
    if (cond) out.push(label);
  };

  switch (kind) {
    case 'text': {
      need(blank((value as TextAnswer).answer), '답변');
      break;
    }
    case 'performance': {
      const a = value as PerformanceAnswer;
      a.subjects.forEach((s, i) => {
        const p = `과목 ${i + 1}`;
        need(blank(s.subject), `${p} 과목명`);
        need(blank(s.topic), `${p} 탐구 주제`);
        need(s.methods.length === 0, `${p} 탐구 방식`);
        need(s.methods.includes('기타') && blank(s.methodOther), `${p} 기타 탐구 방식`);
        need(blank(s.selfRole), `${p} 내가 주도한 부분`);
      });
      a.books.forEach((b, i) => {
        const p = `도서 ${i + 1}`;
        need(blank(b.title), `${p} 책 제목`);
        need(blank(b.linkedSubject), `${p} 연결 교과`);
        need(blank(b.reason), `${p} 읽은 이유`);
        need(blank(b.expansion), `${p} 확장 탐구`);
      });
      need(!a.careerLevel, '진로 탐색 수준');
      need(a.careerLevel === 'specified' && blank(a.careerDetail), '희망 진로 · 전공');
      need(a.outputs.length === 0, '활동 결과물');
      need(a.outputs.includes('기타') && blank(a.outputOther), '기타 결과물 형태');
      break;
    }
    case 'history': {
      const a = value as HistoryAnswer;
      need(!a.hasPriorEducation, '이전 학습 경험');
      if (a.hasPriorEducation === 'yes') {
        a.priorEducation.forEach((p, i) => {
          const k = `기관 ${i + 1}`;
          need(blank(p.institution), `${k} 기관명`);
          need(!p.periodFrom, `${k} 시작 월`);
          need(!p.periodTo, `${k} 종료 월`);
          need(p.subjects.length === 0, `${k} 과목`);
          need(p.subjects.includes('기타') && blank(p.subjectOther), `${k} 기타 과목`);
          need(!p.format, `${k} 형태`);
          need(blank(p.quitReason), `${k} 그만둔 이유`);
        });
      }
      const sum = mixSum(a.currentMix);
      need(sum !== 100, `학습 시간 분배 합계 100% (지금 ${sum}%)`);
      need(!a.studyPlace, '주로 공부하는 곳');
      need(a.studyPlace === '기타' && blank(a.studyPlaceOther), '기타 학습 장소');
      need(a.priorConsulting.had === '', '이전 입시 컨설팅 경험');
      if (a.priorConsulting.had === 'yes') {
        const c = a.priorConsulting;
        need(blank(c.institution), '컨설팅 기관 · 컨설턴트');
        need(blank(c.period), '컨설팅 이용 시기');
        need(c.satisfaction < 1 || c.satisfaction > 5, '컨설팅 만족도');
      }
      break;
    }
    case 'goals': {
      const a = value as GoalsAnswer;
      a.aspirations.forEach((x, i) => {
        const p = ASPIRATION_LABELS[i] ?? `${i + 1}지망`;
        need(blank(x.university), `${p} 대학`);
        need(blank(x.department), `${p} 학과`);
        need(!x.track, `${p} 지원 전형`);
        need(!x.fit, `${p} 난이도 분류`);
        need(blank(x.reason), `${p} 고른 이유`);
      });
      need(!a.priorityAxis, '우선순위');
      need(!a.careerAlignment, '진로 일치 여부');
      break;
    }
    case 'admissionType': {
      const a = value as AdmissionTypeAnswer;
      need(!a.primaryTrack, '주력 전형');
      for (const { semester, status } of classifyInternalSemesters(gradeNumber)) {
        if (status === 'future') continue;
        const row = a.internalGrades.find((g) => g.semester === semester);
        if (!row || row.unregistered) continue;
        need(!INTERNAL_SUBJECT_KEYS.some((k) => !blank(row.grades[k])), `${semesterLabel(semester)} 내신 등급`);
      }
      let registered = 0;
      a.mockGrades.forEach((m, i) => {
        if (m.unregistered) return;
        registered++;
        need(blank(m.label), `모의고사 ${i + 1}회차 이름`);
        need(!MOCK_SUBJECT_KEYS.some((k) => !blank(m.grades[k])), `모의고사 ${i + 1}회차 등급`);
      });
      need(registered === 0, '모의고사 1회 이상');
      need(!a.csatMinimum, '수능 최저 충족 자신감');
      if (a.primaryTrack !== '정시 단일') {
        const filled = a.cardStrategy.map((c, i) => ({ c, i })).filter(({ c }) => isCardFilled(c));
        need(filled.length === 0, '수시 카드 1장 이상');
        for (const { c, i } of filled) {
          const missing = [
            blank(c.university) && '대학',
            blank(c.department) && '학과',
            !c.track && '전형',
            !c.fit && '성향',
          ].filter(Boolean);
          need(missing.length > 0, `카드 ${i + 1} ${missing.join('·')}`);
        }
      }
      need(blank(a.rationale), '판단 근거');
      break;
    }
    case 'strengthsWeaknesses': {
      const a = value as StrengthsWeaknessesAnswer;
      a.bySubject.forEach((s, i) => {
        const p = `과목 ${i + 1}`;
        need(blank(s.subject), `${p} 과목명`);
        need(!s.level, `${p} 강·중·약`);
        need(blank(s.internalGrade), `${p} 내신 등급`);
        need(blank(s.mockGrade), `${p} 모의 등급`);
        need(s.weakAreas.length === 0, `${p} 약한 영역`);
        need(s.weakAreas.includes('기타') && blank(s.weakAreaOther), `${p} 기타 약한 영역`);
        need(blank(s.reason), `${p} 이유`);
      });
      need(a.studyHabits.length === 0, '학습 습관');
      const n = Number(a.focusMinutes);
      need(blank(a.focusMinutes) || !Number.isFinite(n) || n <= 0, '평균 집중 가능 시간');
      need(a.testAnxiety < 1 || a.testAnxiety > 5, '시험 불안도');
      need(a.selfDirection < 1 || a.selfDirection > 5, '자기주도 수준');
      break;
    }
  }
  return out;
}
