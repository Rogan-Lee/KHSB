import { useLocalSearchParams } from 'expo-router';

import { QuestionDetail } from '@/features/staff-inbox/question-detail';

/** 학생 질문 답변 — 소통 탭 > 질문에서 진입 (태블릿은 소통 탭 오른쪽 패널) */
export default function StaffQuestionScreen() {
  const { questionId } = useLocalSearchParams<{ questionId: string }>();
  return <QuestionDetail questionId={String(questionId)} />;
}
