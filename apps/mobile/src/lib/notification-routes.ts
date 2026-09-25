// 알림 data → 열 화면 경로. expo 모듈 없이 순수 함수로 두어 테스트한다 (src/lib/__tests__/mobile-notification-routing.test.ts).

// 알림 data.url 은 허용 목록의 경로만 연다 (임의 경로·외부 URL 차단).
// taskId·questionId·chatId 가 함께 오면 목록 대신 상세 화면으로 간다.

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** 그대로 열 수 있는 화면 */
const STATIC_ROUTES = new Set([
  '/notifications',
  '/account',
  '/(student)/(tabs)',
  '/(student)/(tabs)/tasks',
  '/(student)/(tabs)/qna',
  '/(student)/(tabs)/chat',
  '/(student)/(tabs)/menu',
  '/(student)/points',
  '/(student)/nap',
  '/(student)/network',
  '/(student)/schedule',
  '/(student)/exams',
  '/(student)/lunch',
  '/(student)/contents',
  '/(student)/vocab',
  '/(student)/feedback',
  '/(student)/survey',
  '/(student)/suggestions',
  '/(staff)/(tabs)',
  '/(staff)/(tabs)/attendance',
  '/(staff)/(tabs)/mentoring',
  '/(staff)/(tabs)/inbox',
  '/(staff)/(tabs)/menu',
  '/(staff)/approvals',
  '/(staff)/suggestions',
  '/(staff)/tasks',
  '/(parent)/(tabs)',
  '/(parent)/(tabs)/attendance',
  '/(parent)/(tabs)/reports',
  '/(parent)/(tabs)/growth',
  '/(parent)/(tabs)/menu',
  '/(parent)/schedule',
  '/(parent)/lunch',
  '/(parent)/exams',
  '/(parent)/inquiries',
  '/(parent)/notices',
]);

/** 상세 화면 (마지막 조각이 id) */
const DETAIL_ROUTES = [
  /^\/\(student\)\/tasks\/[A-Za-z0-9_-]{1,64}$/,
  /^\/\(student\)\/qna\/[A-Za-z0-9_-]{1,64}$/,
  /^\/\(student\)\/chat\/[A-Za-z0-9_-]{1,64}$/,
  /^\/\(student\)\/contents\/[A-Za-z0-9_-]{1,64}$/,
  /^\/\(student\)\/vocab\/[A-Za-z0-9_-]{1,64}$/,
  /^\/\(staff\)\/qna\/[A-Za-z0-9_-]{1,64}$/,
  /^\/\(staff\)\/chat\/[A-Za-z0-9_-]{1,64}$/,
  /^\/\(staff\)\/tasks\/[A-Za-z0-9_-]{1,64}$/,
  /^\/\(staff\)\/mentoring\/[A-Za-z0-9_-]{1,64}$/,
  /^\/\(staff\)\/dm\/[A-Za-z0-9_-]{1,64}$/,
  /^\/\(parent\)\/reports\/(mentoring|monthly|online|study-plan|consultation)\/[A-Za-z0-9_-]{1,64}$/,
];

/** 예전 경로·다른 표기 → 현재 경로 */
const ROUTE_ALIASES: Record<string, string> = {
  '/(student)': '/(student)/(tabs)',
  '/(student)/(tabs)/index': '/(student)/(tabs)',
  '/(staff)': '/(staff)/(tabs)',
  '/(staff)/(tabs)/index': '/(staff)/(tabs)',
  '/(parent)': '/(parent)/(tabs)',
  '/(parent)/(tabs)/index': '/(parent)/(tabs)',
  // 옛 서버가 보내는 url
  '/student-tasks': '/(student)/(tabs)/tasks',
  '/(student)/qna': '/(student)/(tabs)/qna',
  '/(student)/chat': '/(student)/(tabs)/chat',
  '/(staff)/qna': '/(staff)/(tabs)/inbox',
  '/(staff)/chat': '/(staff)/(tabs)/inbox',
  '/messages': '/(staff)/(tabs)/inbox',
  '/staff-tasks': '/(staff)/tasks',
  '/(staff)/staff-tasks': '/(staff)/tasks',
  '/(parent)/reports': '/(parent)/(tabs)/reports',
  '/(parent)/attendance': '/(parent)/(tabs)/attendance',
  '/(student)/vocab/index': '/(student)/vocab',
  '/(student)/survey/index': '/(student)/survey',
};

function idParam(data: Record<string, unknown>, key: string) {
  const value = data[key];
  return typeof value === 'string' && ID_PATTERN.test(value) ? value : null;
}

/** 알림 data → 열 화면 경로 (허용되지 않으면 null) */
export function resolveNotificationHref(data: Record<string, unknown> | null | undefined): string | null {
  if (!data) return null;
  const raw = data.url;
  if (typeof raw !== 'string') return null;
  const path = raw.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  const base = ROUTE_ALIASES[path] ?? path;

  if (DETAIL_ROUTES.some((pattern) => pattern.test(base))) return base;
  if (!STATIC_ROUTES.has(base)) return null;

  const taskId = idParam(data, 'taskId');
  const questionId = idParam(data, 'questionId');
  const chatId = idParam(data, 'chatId');
  switch (base) {
    case '/(student)/(tabs)/tasks':
      return taskId ? `/(student)/tasks/${taskId}` : base;
    case '/(student)/(tabs)/qna':
      return questionId ? `/(student)/qna/${questionId}` : base;
    case '/(student)/(tabs)/chat':
      return chatId ? `/(student)/chat/${chatId}` : base;
    case '/(staff)/(tabs)/inbox':
      if (questionId) return `/(staff)/qna/${questionId}`;
      if (chatId) return `/(staff)/chat/${chatId}`;
      return base;
    case '/(staff)/tasks':
      return taskId ? `/(staff)/tasks/${taskId}` : base;
    default:
      return base;
  }
}
