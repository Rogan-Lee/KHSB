import { useLocalSearchParams } from 'expo-router';

import { Screen } from '@/design';
import { QuestionThreadView } from '@/features/student-comm/question-thread-view';

/** 질문 상세 — 웹 학생 포털 qna/[questionId] (제목 "질문", 회색 캔버스 위 말풍선 + 하단 답글 작성) */
export default function StudentQuestionDetailScreen() {
  const { questionId } = useLocalSearchParams<{ questionId: string }>();
  return (
    <Screen kind="push" title="질문" scroll={false} maxWidth={0} backFallback="/(student)/(tabs)/qna">
      {questionId ? <QuestionThreadView questionId={questionId} /> : null}
    </Screen>
  );
}
