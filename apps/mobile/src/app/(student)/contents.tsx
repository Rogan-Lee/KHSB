import { useRouter } from 'expo-router';
import { Newspaper } from 'lucide-react-native';
import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import {
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  Screen,
  Section,
  space,
  Stack,
  TABLET_WIDE,
  Text,
  useResponsive,
} from '@/design';
import { ContentCard, ContentCardSkeleton } from '@/features/student-contents/content-card';
import { openExternal } from '@/features/student-contents/meta';
import {
  CONTENT_TYPE_ORDER,
  studentContentPaths,
  type ContentType,
  type StudentContentItem,
  type StudentContentsResponse,
} from '@/lib/api/student-contents';
import { useMobileQuery } from '@/lib/mobile-api';

// 웹 학생 포털 콘텐츠(/s/[token]/contents)와 같은 카드 목록. 앱은 유형 칩으로 거를 수 있다.
// 앱에서 읽는 글(후기·선배 아티클·원장 칼럼)은 상세 화면, 외부 링크형(팟캐스트·외부 아티클)은 원문을 바로 연다.
// 태블릿은 2칸(가로로 넓으면 3칸) 그리드.

type Filter = 'all' | ContentType;

/** 가로로 n 칸씩 — 마지막 줄은 빈 칸으로 채워 카드 폭을 맞춘다 */
function Grid<T>({
  items,
  columns,
  render,
  keyOf,
}: {
  items: T[];
  columns: number;
  render: (item: T) => ReactNode;
  keyOf: (item: T, index: number) => string;
}) {
  if (columns <= 1) return <Stack>{items.map((it, i) => <View key={keyOf(it, i)}>{render(it)}</View>)}</Stack>;
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += columns) rows.push(items.slice(i, i + columns));
  return (
    <Stack>
      {rows.map((row, ri) => (
        <View key={ri} style={{ flexDirection: 'row', gap: space.x3 }}>
          {Array.from({ length: columns }, (_, ci) => (
            <View key={row[ci] ? keyOf(row[ci], ri * columns + ci) : `empty-${ci}`} style={{ flex: 1, minWidth: 0 }}>
              {row[ci] ? render(row[ci]) : null}
            </View>
          ))}
        </View>
      ))}
    </Stack>
  );
}

export default function StudentContentsScreen() {
  const router = useRouter();
  const { isTablet, width } = useResponsive();
  const columns = isTablet ? (width >= 1000 ? 3 : 2) : 1;
  const { data, error, isRefreshing, refresh, retry } = useMobileQuery<StudentContentsResponse>(
    studentContentPaths.list,
  );
  const [filter, setFilter] = useState<Filter>('all');

  const items = useMemo(() => data?.items ?? [], [data]);
  // 실제로 있는 유형만 칩으로 (관리자 탭 순서)
  const types = useMemo(() => {
    const present = new Map<ContentType, string>();
    for (const it of items) if (!present.has(it.type)) present.set(it.type, it.typeLabel);
    return CONTENT_TYPE_ORDER.filter((t) => present.has(t)).map((t) => ({ type: t, label: present.get(t)! }));
  }, [items]);
  const active: Filter = filter !== 'all' && types.some((t) => t.type === filter) ? filter : 'all';
  const shown = active === 'all' ? items : items.filter((it) => it.type === active);

  const open = (item: StudentContentItem) => {
    if (item.externalUrl) void openExternal(item.externalUrl);
    else router.push(`/(student)/contents/${item.id}`);
  };

  return (
    <Screen
      kind="push"
      title="콘텐츠"
      backFallback="/(student)/(tabs)/menu"
      refreshing={isRefreshing}
      onRefresh={() => void refresh()}
      maxWidth={isTablet ? TABLET_WIDE : undefined}>
      <Stack>
        <Text variant="t4-regular" color="neutralSubtle" style={{ paddingHorizontal: space.x1, paddingTop: space.x2 }}>
          강한선배가 준비한 후기·칼럼·팟캐스트를 만나보세요.
        </Text>

        {!data ? (
          error ? (
            <ErrorState message={error} onRetry={() => void retry()} />
          ) : (
            <Grid
              items={Array.from({ length: columns * 2 }, (_, i) => i)}
              columns={columns}
              keyOf={(i) => `sk-${i}`}
              render={() => <ContentCardSkeleton />}
            />
          )
        ) : items.length === 0 ? (
          <Section>
            <EmptyState icon={Newspaper} title="아직 등록된 콘텐츠가 없어요" description="곧 찾아올게요!" />
          </Section>
        ) : (
          <>
            {types.length > 1 && (
              <ChipGroup>
                <Chip selected={active === 'all'} onPress={() => setFilter('all')}>
                  전체
                </Chip>
                {types.map((t) => (
                  <Chip key={t.type} selected={active === t.type} onPress={() => setFilter(t.type)}>
                    {t.label}
                  </Chip>
                ))}
              </ChipGroup>
            )}
            <Grid
              items={shown}
              columns={columns}
              keyOf={(it) => it.id}
              render={(it) => <ContentCard item={it} onPress={() => open(it)} />}
            />
          </>
        )}
      </Stack>
    </Screen>
  );
}
