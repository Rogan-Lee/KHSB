import { useLocalSearchParams } from 'expo-router';

import { TaskReviewView } from '@/features/staff-learning/task-review';

/** 수행평가 검토·피드백 (폰). 태블릿은 수행평가 목록 오른쪽 패널에서 같은 화면을 띄운다. */
export default function StaffTaskDetailScreen() {
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  return <TaskReviewView taskId={String(taskId)} />;
}
