import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import {
  Badge,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  ListRow,
  LoadingState,
  Segmented,
} from '@/components/mobile-ui';
import { colors, spacing, Tone, type } from '@/constants/theme';
import { formatKstTime } from '@/lib/format';
import { ParentAttendanceResponse, useMobileQuery } from '@/lib/mobile-api';
import { useSession } from '@/lib/session';

const STATUS_TONE: Record<string, Tone> = {
  입실: 'positive',
  퇴실: 'neutral',
  결석: 'negative',
  미입실: 'warning',
};

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

function currentKstMonth() {
  return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7);
}

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

function formatDay(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${DAY_NAMES[d.getUTCDay()]})`;
}

export default function ParentAttendanceScreen() {
  const { session } = useSession();
  const kids = session?.children ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const childId = selectedId ?? kids[0]?.id;
  const [month, setMonth] = useState(currentKstMonth);

  const { data, error, isLoading, isRefreshing, refresh, retry } =
    useMobileQuery<ParentAttendanceResponse>(
      `/api/mobile/v1/parent/attendance?studentId=${childId ?? ''}&month=${month}`,
    );

  const [year, monthNum] = month.split('-');

  return (
    <AppScreen
      onRefresh={() => void refresh()}
      refreshing={isRefreshing}
      title="출결">
      {kids.length > 1 ? (
        <Segmented
          options={kids.map((k) => ({ label: k.name, value: k.id }))}
          value={childId ?? ''}
          onChange={setSelectedId}
        />
      ) : null}

      <View style={styles.monthRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setMonth((m) => shiftMonth(m, -1))}
          style={({ pressed }) => [styles.monthBtn, pressed && styles.pressed]}>
          <ChevronLeft color={colors.textNormal} size={20} />
        </Pressable>
        <Text style={styles.monthLabel}>
          {Number(year)}년 {Number(monthNum)}월
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={month >= currentKstMonth()}
          onPress={() => setMonth((m) => shiftMonth(m, 1))}
          style={({ pressed }) => [
            styles.monthBtn,
            pressed && styles.pressed,
            month >= currentKstMonth() && styles.monthBtnDisabled,
          ]}>
          <ChevronRight color={colors.textNormal} size={20} />
        </Pressable>
      </View>

      {isLoading && !data ? <LoadingState /> : null}
      {error && !data ? <ErrorState message={error} onRetry={() => void retry()} /> : null}
      {data ? (
        data.items.length === 0 ? (
          <EmptyState title="출결 기록이 없습니다" />
        ) : (
          <Card>
            {data.items.map((item, index) => (
              <View key={item.date}>
                {index > 0 ? <Divider /> : null}
                <ListRow
                  title={formatDay(item.date)}
                  caption={
                    item.checkIn
                      ? `입실 ${formatKstTime(item.checkIn)}${
                          item.checkOut ? ` · 퇴실 ${formatKstTime(item.checkOut)}` : ''
                        }`
                      : undefined
                  }
                  right={
                    <Badge tone={STATUS_TONE[item.status] ?? 'neutral'}>
                      {item.status}
                    </Badge>
                  }
                />
              </View>
            ))}
          </Card>
        )
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  monthRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  monthBtn: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  monthBtnDisabled: {
    opacity: 0.35,
  },
  monthLabel: { ...type.headline, color: colors.textNormal },
  pressed: {
    opacity: 0.7,
  },
  spacer: {
    height: spacing.xs,
  },
});
