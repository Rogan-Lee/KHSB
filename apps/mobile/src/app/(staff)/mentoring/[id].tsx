import { useLocalSearchParams } from 'expo-router';

import { MentoringDetailView } from '@/features/staff-learning/mentoring-detail';

/** 멘토링 상세·기록 작성 (폰). 태블릿은 멘토링 탭 오른쪽 패널에서 같은 화면을 띄운다. */
export default function StaffMentoringDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <MentoringDetailView id={String(id)} />;
}
