import { useLocalSearchParams } from 'expo-router';
import { ArrowUpRight } from 'lucide-react-native';

import { Button, ErrorState, Screen } from '@/design';
import { ContentDetailSkeleton, ContentDetailView } from '@/features/student-contents/content-detail';
import { openExternal } from '@/features/student-contents/meta';
import { studentContentPaths, type StudentContentDetail } from '@/lib/api/student-contents';
import { useMobileQuery } from '@/lib/mobile-api';

// 웹 학생 포털 콘텐츠 상세(/s/[token]/contents/[id])와 같은 구성 — 흰 바탕 읽기 화면, 원문이 있으면 하단 "원문 보기".

export default function StudentContentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, isRefreshing, refresh, retry } = useMobileQuery<StudentContentDetail>(
    studentContentPaths.detail(String(id ?? '')),
  );

  const footer = data?.url ? (
    <Button
      variant={data.body ? 'gray' : 'primary'}
      size="xl"
      block
      iconRight={ArrowUpRight}
      accessibilityLabel="원문 보기 (외부 링크)"
      onPress={() => void openExternal(data.url!)}>
      원문 보기
    </Button>
  ) : undefined;

  return (
    <Screen
      kind="push"
      title=""
      surface="panel"
      backFallback="/(student)/contents"
      refreshing={isRefreshing}
      onRefresh={() => void refresh()}
      footer={footer}>
      {data ? (
        <ContentDetailView post={data} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void retry()} />
      ) : (
        <ContentDetailSkeleton />
      )}
    </Screen>
  );
}
