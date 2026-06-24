/**
 * 온보딩 설문 — 클라이언트 미러(옵션 상수·데이터 shape·초기값·학기 분류).
 * 권위 검증(is*Complete)은 백엔드(survey-template)가 수행하고 complete 플래그를 내려준다.
 * 여기서는 에디터가 동일 JSON shape 를 만들 수 있도록 타입·초기값·옵션만 유지한다.
 */

export type SurveyKind =
  | 'text'
  | 'performance'
  | 'history'
  | 'goals'
  | 'admissionType'
  | 'strengthsWeaknesses';

// ── performance ──
export const PERFORMANCE_METHOD_OPTIONS = ['실험', '자료분석', '토론', '발표', '프로젝트', '기타'];
export const PERFORMANCE_OUTPUT_OPTIONS = ['보고서', '발표자료', '영상', '코드', '실험결과', '기타'];
export const CAREER_LEVELS = [
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
  careerLevel: '' | 'interested' | 'exploring' | 'specified';
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

// ── history ──
export const HISTORY_SUBJECT_OPTIONS = ['국', '수', '영', '사', '과', '기타'];
export const HISTORY_FORMAT_OPTIONS = ['현강', '인강', '과외', '관리형'];
export const HISTORY_PLACE_OPTIONS = ['독서실', '집', '학원 자습실', '카페', '학교 야자', '기타'];
export const HISTORY_MIX_KEYS = ['school', 'academy', 'online', 'selfStudy'] as const;
export const HISTORY_MIX_LABELS: Record<(typeof HISTORY_MIX_KEYS)[number], string> = {
  school: '학교',
  academy: '학원',
  online: '인강',
  selfStudy: '자기주도',
};
export type HistoryFormat = '' | '현강' | '인강' | '과외' | '관리형';
export type PriorEducation = {
  institution: string;
  periodFrom: string;
  periodTo: string;
  subjects: string[];
  subjectOther?: string;
  format: HistoryFormat;
  quitReason: string;
};
export type StudyMix = { school: number; academy: number; online: number; selfStudy: number };
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

// ── goals ──
export const GOALS_TRACK_OPTIONS = ['학종', '교과', '정시', '논술'];
export const GOALS_FIT_OPTIONS = ['적정', '소신', '안정'];
export const GOALS_PRIORITY_AXIS_OPTIONS = [
  { value: 'department', label: '학과 우선' },
  { value: 'university', label: '대학 우선' },
  { value: 'noCompromise', label: '둘 다 양보 불가' },
];
export const GOALS_CAREER_ALIGNMENT_OPTIONS = [
  { value: 'match', label: '일치' },
  { value: 'partial', label: '부분 일치' },
  { value: 'undecided', label: '진로 미정' },
];
export const ASPIRATION_LABELS = ['1지망', '2지망', '3지망'];
export type GoalsTrack = '' | '학종' | '교과' | '정시' | '논술';
export type GoalsFit = '' | '적정' | '소신' | '안정';
export type Aspiration = {
  university: string;
  department: string;
  track: GoalsTrack;
  fit: GoalsFit;
  reason: string;
};
export type GoalsAnswer = {
  aspirations: Aspiration[];
  priorityAxis: '' | 'department' | 'university' | 'noCompromise';
  careerAlignment: '' | 'match' | 'partial' | 'undecided';
  legacyText?: string;
};

// ── admissionType ──
export const ADMISSION_PRIMARY_TRACK_OPTIONS = [
  '학종 단일',
  '교과 단일',
  '정시 단일',
  '학종+정시 병행',
  '교과+정시 병행',
];
export const ADMISSION_CSAT_OPTIONS = ['충족 자신', '빠듯함', '불가', '미적용 전형'];
export const ADMISSION_CARD_TRACK_OPTIONS = ['학종', '교과', '정시', '논술'];
export const ADMISSION_CARD_FIT_OPTIONS = ['적정', '소신', '안정'];
export const ALL_INTERNAL_SEMESTERS = ['1-1', '1-2', '2-1', '2-2', '3-1'] as const;
export type InternalSemesterKey = (typeof ALL_INTERNAL_SEMESTERS)[number];
export const INTERNAL_SUBJECT_KEYS = ['국', '수', '영', '탐1', '탐2', '전체'];
export const MOCK_SUBJECT_KEYS = ['국', '수', '영', '탐1', '탐2'];
export type AdmissionCardTrack = '' | '학종' | '교과' | '정시' | '논술';
export type AdmissionCardFit = '' | '적정' | '소신' | '안정';
export type InternalSemester = {
  semester: InternalSemesterKey;
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
  internalGrades: InternalSemester[];
  mockGrades: MockExam[];
  csatMinimum: string;
  cardStrategy: AdmissionCard[];
  rationale: string;
  legacyText?: string;
};
const emptyGradeMap = (keys: string[]): Record<string, string> =>
  keys.reduce((acc, k) => ({ ...acc, [k]: '' }), {} as Record<string, string>);
export const emptyMockExam = (): MockExam => ({
  label: '',
  unregistered: false,
  grades: emptyGradeMap(MOCK_SUBJECT_KEYS),
  percentiles: emptyGradeMap(MOCK_SUBJECT_KEYS),
});
export const emptyAdmissionCard = (): AdmissionCard => ({
  university: '',
  department: '',
  track: '',
  fit: '',
});

/** 학년·학사일정 기반 노출 학기 분류 (백엔드 classifyInternalSemesters 미러). */
export function classifyInternalSemesters(
  gradeNumber: 1 | 2 | 3 | null,
  month: number,
): { semester: InternalSemesterKey; status: 'completed' | 'ongoing' | 'future' }[] {
  if (!gradeNumber) {
    return ALL_INTERNAL_SEMESTERS.map((s) => ({ semester: s, status: 'ongoing' as const }));
  }
  const currentTermInYear: 1 | 2 = month >= 3 && month <= 8 ? 1 : 2;
  return ALL_INTERNAL_SEMESTERS.map((sem) => {
    const [y, t] = sem.split('-').map(Number) as [1 | 2 | 3, 1 | 2];
    if (y < gradeNumber) return { semester: sem, status: 'completed' as const };
    if (y > gradeNumber) return { semester: sem, status: 'future' as const };
    if (t < currentTermInYear) return { semester: sem, status: 'completed' as const };
    if (t === currentTermInYear) return { semester: sem, status: 'ongoing' as const };
    return { semester: sem, status: 'future' as const };
  });
}

// ── strengthsWeaknesses ──
export const SW_LEVEL_OPTIONS = ['강', '중', '약'];
export const SW_WEAK_AREA_OPTIONS = ['개념', '계산', '서술형', '킬러문항', '시간 부족', '기타'];
export const SW_HABIT_OPTIONS = [
  '계획형',
  '즉흥형',
  '미루기',
  '복습 안 함',
  '오답노트 작성',
  '벼락치기',
  '인강 누적 시청',
];
export type SwLevel = '' | '강' | '중' | '약';
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
  testAnxiety: number;
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

export type TextAnswer = { answer: string };
