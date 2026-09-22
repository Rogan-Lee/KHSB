import { ExternalLink, FileText } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import {
  Card,
  Divider,
  EmptyState,
  ErrorState,
  ListRow,
  LoadingState,
  Segmented,
} from '@/components/mobile-ui';
import { colors } from '@/constants/theme';
import { formatShortDateTime } from '@/lib/format';
import { ParentReportsResponse, useMobileQuery } from '@/lib/mobile-api';
import { useSession } from '@/lib/session';

export default function ParentReportsScreen() {
  const { session } = useSession();
  const kids = session?.children ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const childId = selectedId ?? kids[0]?.id;

  const { data, error, isLoading, isRefreshing, refresh, retry } =
    useMobileQuery<ParentReportsResponse>(
      `/api/mobile/v1/parent/reports?studentId=${childId ?? ''}`,
    );

  return (
    <AppScreen
      onRefresh={() => void refresh()}
      refreshing={isRefreshing}
      subtitle="멘토링 후 발송된 학부모 리포트를 확인하세요."
      title="리포트">
      {kids.length > 1 ? (
        <Segmented
          options={kids.map((k) => ({ label: k.name, value: k.id }))}
          value={childId ?? ''}
          onChange={setSelectedId}
        />
      ) : null}

      {isLoading && !data ? <LoadingState /> : null}
      {error && !data ? <ErrorState message={error} onRetry={() => void retry()} /> : null}
      {data ? (
        data.items.length === 0 ? (
          <EmptyState title="발송된 리포트가 없습니다" />
        ) : (
          <Card>
            {data.items.map((item, index) => (
              <View key={item.id}>
                {index > 0 ? <Divider /> : null}
                <ListRow
                  leading={<FileText color={colors.primary} size={18} />}
                  title="학습 리포트"
                  caption={formatShortDateTime(item.createdAt)}
                  right={<ExternalLink color={colors.textAssistive} size={18} />}
                  onPress={() => void Linking.openURL(item.url)}
                />
              </View>
            ))}
          </Card>
        )
      ) : null}
    </AppScreen>
  );
}
