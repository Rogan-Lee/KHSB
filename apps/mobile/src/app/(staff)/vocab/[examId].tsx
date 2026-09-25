import { useLocalSearchParams } from 'expo-router';

import { VocabExamView } from '@/features/staff-learning/vocab-ui';

/** 영단어 시험 상세 — 학생별 응시 현황 (폰). 태블릿은 영단어 화면 오른쪽 패널. */
export default function StaffVocabExamScreen() {
  const { examId } = useLocalSearchParams<{ examId: string }>();
  return <VocabExamView examId={String(examId)} />;
}
