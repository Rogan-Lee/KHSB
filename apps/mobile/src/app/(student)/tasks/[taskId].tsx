import { useLocalSearchParams } from 'expo-router';

import { TaskDetail } from '@/features/student-tasks/task-detail';

/** 과제 상세 (폰) — 태블릿은 수행평가 탭의 오른쪽 패널에서 같은 TaskDetail 을 쓴다 */
export default function StudentTaskDetailScreen() {
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  return <TaskDetail key={taskId} taskId={String(taskId ?? '')} />;
}
