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

export const DESCRIPTION_TEMPLATES: Record<string, string> = {
  BUG: `## 현재 동작
(어떤 문제가 발생하는지 구체적으로 적어주세요)

## 기대 동작
(정상적으로 어떻게 동작해야 하는지)

## 재현 방법
1. (어디 페이지에서)
2. (무엇을 클릭/입력하면)
3. (어떤 에러가 발생)

## 스크린샷
(이미지를 드래그하거나 붙여넣기 해주세요)`,

  FEATURE: `## 필요한 기능
(어떤 기능이 필요한지 구체적으로 적어주세요)

## 사용 시나리오
(이 기능을 언제, 어떻게 사용하고 싶은지)
- 예: "학생 목록에서 OO를 클릭하면 OO이 표시되었으면 좋겠다"

## 참고 화면/예시
(비슷한 기능의 스크린샷이나 예시가 있으면 첨부해주세요)`,

  IMPROVEMENT: `## 현재 상태
(지금 어떻게 동작하는지)

## 개선 요청
(어떻게 바뀌면 좋겠는지 구체적으로 적어주세요)
- 예: "OO 버튼 위치를 OO로 옮기면 편할 것 같다"
- 예: "OO 목록에 OO 정보도 표시해주세요"

## 스크린샷
(현재 화면 스크린샷에 표시해주시면 더 빠르게 처리됩니다)`,
};
