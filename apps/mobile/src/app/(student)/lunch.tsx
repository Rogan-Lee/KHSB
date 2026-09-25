import type { LunchAdapter } from '@/features/lunch/adapter';
import { LunchFlow } from '@/features/lunch/lunch-flow';
import {
  claimStudentLunchDeposit,
  requestStudentLunchChange,
  saveStudentLunchOrder,
  STUDENT_LUNCH_PATH,
  type StudentLunchResponse,
} from '@/lib/api/student-lunch';
import { useMobileQuery } from '@/lib/mobile-api';

/**
 * 학생 도시락 신청 — 웹 학생 포털 /s/[token]/lunch 의 네이티브판 (학부모 화면과 같은 LunchFlow).
 * 앱 로그인 학생 본인 기준 — 매직링크 토큰 없이 서버가 requireMobileStudent 로 인증한다.
 */
const STUDENT_LUNCH: LunchAdapter = {
  key: 'me',
  audience: 'student',
  backFallback: '/(student)/(tabs)/menu',
  childSwitcher: false,
  saveOrder: saveStudentLunchOrder,
  claimDeposit: claimStudentLunchDeposit,
  requestChange: requestStudentLunchChange,
};

export default function StudentLunchScreen() {
  const query = useMobileQuery<StudentLunchResponse>(STUDENT_LUNCH_PATH);
  return <LunchFlow adapter={STUDENT_LUNCH} query={query} />;
}
