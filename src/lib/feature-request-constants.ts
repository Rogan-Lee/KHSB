export const CATEGORY_OPTIONS = [
  { value: "BUG", label: "버그", color: "text-red-600", bg: "bg-red-50 border-red-200" },
  { value: "FEATURE", label: "기능요청", color: "text-violet-600", bg: "bg-violet-50 border-violet-200" },
  { value: "IMPROVEMENT", label: "개선", color: "text-blue-600", bg: "bg-blue-50 border-blue-200" },
] as const;

export const PRIORITY_OPTIONS = [
  { value: "URGENT", label: "긴급", color: "text-red-600", bg: "bg-red-50 border-red-200" },
  { value: "NORMAL", label: "일반", color: "text-gray-600", bg: "bg-gray-50 border-gray-200" },
] as const;

export const RELATED_PAGE_OPTIONS = [
  { value: "dashboard", label: "대시보드" },
  { value: "attendance", label: "입퇴실 관리" },
  { value: "handover", label: "인수인계" },
  { value: "todos", label: "투두리스트" },
  { value: "students", label: "원생 관리" },
  { value: "seat-map", label: "좌석 배치도" },
  { value: "merit-demerit", label: "상벌점" },
  { value: "assignments", label: "과제 관리" },
  { value: "mentoring", label: "멘토링" },
  { value: "mentoring-plan", label: "주간 멘토링 계획" },
  { value: "timetable", label: "시간표" },
  { value: "consultations", label: "원장 면담" },
  { value: "calendar", label: "캘린더" },
  { value: "meeting-minutes", label: "회의록" },
  { value: "messages", label: "카카오 메시지" },
  { value: "requests", label: "요청사항" },
  { value: "other", label: "기타" },
] as const;

export const ROLE_LABEL: Record<string, string> = {
  ADMIN: "관리자",
  DIRECTOR: "원장",
  MENTOR: "멘토",
  STAFF: "스탭",
};
