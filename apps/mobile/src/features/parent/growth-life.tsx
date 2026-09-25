import { Award, NotebookPen, ThumbsUp, TriangleAlert } from 'lucide-react-native';
import { View } from 'react-native';

import { Badge, EmptyState, IconTile, ListRow, Notice, Section, space, Stack, Text } from '@/design';
import type { ParentMeritMonth, ParentMeritsResponse } from '@/lib/api/parent-reports';

import { formatDayKey, formatMonthKey } from './report-format';

/**
 * 성장 · 생활 — 리포트 공개로 표시된 상벌점·원생 기록을 달별로.
 * 누적 잔액(포인트)은 보여 주지 않는다 — 달마다 받은 상점·벌점 합만.
 */
export function GrowthLife({ data }: { data: ParentMeritsResponse }) {
  if (data.months.length === 0) {
    return (
      <Section>
        <EmptyState
          icon={Award}
          title="아직 생활 기록이 없어요"
          description={'상점·벌점이나 원생 기록이 생기면\n달별로 모아 보여 드려요.'}
        />
      </Section>
    );
  }

  return (
    <Stack>
      {data.months.map((m) => (
        <MonthCard key={m.month} month={m} />
      ))}
      <Text variant="t3-regular" color="neutralSubtle" align="center" style={{ marginTop: space.x1 }}>
        독서실에서 학부모 공개로 표시한 기록만 보여요.
      </Text>
    </Stack>
  );
}

function MonthCard({ month: m }: { month: ParentMeritMonth }) {
  return (
    <Section
      title={formatMonthKey(m.month)}
      description={
        m.merit.count + m.demerit.count > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.x1, marginTop: space.x1_5 }}>
            {m.merit.count > 0 && (
              <Badge tone="ok" size="md">{`상점 ${m.merit.count}건 · +${m.merit.points}점`}</Badge>
            )}
            {m.demerit.count > 0 && (
              <Badge tone="bad" size="md">{`벌점 ${m.demerit.count}건 · -${m.demerit.points}점`}</Badge>
            )}
          </View>
        ) : undefined
      }
      flush>
      {m.note && (
        <View style={{ paddingHorizontal: space.x4, paddingTop: space.x1, paddingBottom: space.x2 }}>
          <Notice tone="gray" icon={NotebookPen} title="원생 기록">
            {m.note}
          </Notice>
        </View>
      )}
      {m.items.map((it) => {
        const merit = it.type === 'MERIT';
        return (
          <ListRow
            key={it.id}
            align="start"
            leading={
              <IconTile icon={merit ? ThumbsUp : TriangleAlert} tone={merit ? 'ok' : 'bad'} size={32} round />
            }
            title={<Text variant="t5-medium">{it.reason}</Text>}
            description={
              <Text variant="t4-regular" color="neutralSubtle" numberOfLines={1}>
                {it.category ? `${formatDayKey(it.date)} · ${it.category}` : formatDayKey(it.date)}
              </Text>
            }
            trailing={
              <Text variant="t5-bold" color={merit ? 'positive' : 'critical'} tabular>
                {merit ? `+${it.points}점` : `-${it.points}점`}
              </Text>
            }
          />
        );
      })}
      {m.items.length === 0 && (
        <Text
          variant="t4-regular"
          color="neutralSubtle"
          style={{ paddingHorizontal: space.x5, paddingBottom: space.x3 }}>
          이 달에는 상점·벌점이 없어요.
        </Text>
      )}
    </Section>
  );
}
