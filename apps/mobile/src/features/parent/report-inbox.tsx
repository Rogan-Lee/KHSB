import { Inbox } from 'lucide-react-native';
import { useMemo } from 'react';
import { View } from 'react-native';

import {
  Badge,
  Chip,
  ChipGroup,
  color,
  EmptyState,
  GroupLabel,
  IconTile,
  ListRow,
  Section,
  Skeleton,
  space,
  Stack,
  Text,
} from '@/design';
import type { ParentReportInboxResponse, ParentReportItem, ParentReportKind } from '@/lib/api/parent-reports';

import { formatMonthKey, formatReportDate, monthKeyOf } from './report-format';
import { REPORT_KIND, REPORT_KIND_ORDER } from './report-kind';

export type ReportFilter = ParentReportKind | 'all';

/** 리포트 한 줄 — 종류 아이콘 · (새 리포트) · 제목 · 날짜와 보조 설명 */
export function ReportRow({
  item,
  onPress,
  selected = false,
}: {
  item: ParentReportItem;
  onPress: () => void;
  selected?: boolean;
}) {
  const kind = REPORT_KIND[item.kind];
  const date = formatReportDate(item.date);
  return (
    <ListRow
      onPress={onPress}
      leading={<IconTile icon={kind.icon} tone={kind.tone} size={44} />}
      meta={
        item.isNew ? (
          <Badge tone="brand" solid>
            새 리포트
          </Badge>
        ) : undefined
      }
      title={
        <Text variant="t5-medium" numberOfLines={2}>
          {item.title}
        </Text>
      }
      description={
        <Text variant="t4-regular" color="neutralSubtle" numberOfLines={1} tabular>
          {item.subtitle ? `${date} · ${item.subtitle}` : date}
        </Text>
      }
      style={selected ? { backgroundColor: color.bg.transparentSelected } : undefined}
    />
  );
}

/**
 * 리포트함 본문 — 종류 필터 칩 + 월별 묶음 목록.
 * 폰은 Screen 스크롤 안, 태블릿은 TwoPane 왼쪽 패널 안에 그대로 놓는다.
 */
export function ReportInbox({
  data,
  filter,
  onFilter,
  onOpen,
  selectedKey,
}: {
  data: ParentReportInboxResponse;
  filter: ReportFilter;
  onFilter: (f: ReportFilter) => void;
  onOpen: (item: ParentReportItem) => void;
  selectedKey?: string | null;
}) {
  const kinds = REPORT_KIND_ORDER.filter((k) => data.counts[k] > 0);
  const active: ReportFilter = filter !== 'all' && data.counts[filter] > 0 ? filter : 'all';

  const groups = useMemo(() => {
    const list = active === 'all' ? data.reports : data.reports.filter((r) => r.kind === active);
    const out: { month: string; items: ParentReportItem[] }[] = [];
    for (const r of list) {
      const month = monthKeyOf(r.date);
      const last = out[out.length - 1];
      if (last?.month === month) last.items.push(r);
      else out.push({ month, items: [r] });
    }
    return out;
  }, [data.reports, active]);

  if (data.reports.length === 0) {
    return (
      <Section>
        <EmptyState
          icon={Inbox}
          title="아직 받은 리포트가 없어요"
          description={'멘토링 리포트·월간 리포트·상담 안내가\n발송되면 이곳에 모여요.'}
        />
      </Section>
    );
  }

  return (
    <Stack>
      {kinds.length > 1 && (
        <ChipGroup>
          <Chip selected={active === 'all'} onPress={() => onFilter('all')}>
            {`전체 ${data.counts.all}`}
          </Chip>
          {kinds.map((k) => (
            <Chip key={k} selected={active === k} onPress={() => onFilter(k)}>
              {`${REPORT_KIND[k].chip} ${data.counts[k]}`}
            </Chip>
          ))}
        </ChipGroup>
      )}
      {groups.map((g) => (
        <View key={g.month}>
          <GroupLabel trailing={`${g.items.length}건`}>{formatMonthKey(g.month)}</GroupLabel>
          <Section flush>
            {g.items.map((item) => (
              <ReportRow
                key={item.key}
                item={item}
                onPress={() => onOpen(item)}
                selected={selectedKey === item.key}
              />
            ))}
          </Section>
        </View>
      ))}
    </Stack>
  );
}

/** 첫 로드 — 칩 줄 + 목록 카드 모양 */
export function ReportInboxSkeleton() {
  return (
    <Stack>
      <View style={{ flexDirection: 'row', gap: space.x2 }}>
        {[64, 84, 64, 76].map((w, i) => (
          <Skeleton key={i} style={{ width: w, height: 36, borderRadius: 18 }} />
        ))}
      </View>
      <View>
        <Skeleton style={{ width: 48, height: 16, marginVertical: space.x2, marginLeft: space.x1 }} />
        <Section flush>
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.x3,
                paddingHorizontal: space.x5,
                paddingVertical: space.x3,
              }}>
              <Skeleton style={{ width: 44, height: 44, borderRadius: 14 }} />
              <View style={{ flex: 1, gap: space.x1_5 }}>
                <Skeleton style={{ width: '70%', height: 16 }} />
                <Skeleton style={{ width: '45%', height: 14 }} />
              </View>
            </View>
          ))}
        </Section>
      </View>
    </Stack>
  );
}
