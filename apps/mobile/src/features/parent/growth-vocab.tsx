import { BookOpen, FileText, Laptop } from 'lucide-react-native';
import { View } from 'react-native';

import { Badge, EmptyState, IconTile, ListRow, Section, space, Stack, StatGrid, Text } from '@/design';
import type { ParentVocabResponse } from '@/lib/api/parent-reports';

import { GrowthLineChart, scoreDomain } from './growth-line-chart';
import { formatDayKey, formatDecimal, shortDayKey } from './report-format';

const score = (v: number) => `${formatDecimal(v)}점`;

/** 성장 · 영단어 — 응시·평균·최근 + 점수 추이 + 최근 시험 (종이 시험과 앱 시험을 함께) */
export function GrowthVocab({ data }: { data: ParentVocabResponse }) {
  if (data.stats.count === 0) {
    return (
      <Section>
        <EmptyState
          icon={BookOpen}
          title="아직 본 영단어 시험이 없어요"
          description={'독서실 영단어 시험을 보면\n점수와 흐름을 보여 드려요.'}
        />
      </Section>
    );
  }

  const points = data.trend.map((t) => ({
    key: t.id,
    label: shortDayKey(t.date),
    value: t.score,
    caption: formatDayKey(t.date),
  }));

  return (
    <Stack>
      <Section>
        <StatGrid
          items={[
            { label: '응시', value: `${data.stats.count}회` },
            {
              label: '평균',
              value: data.stats.average != null ? score(data.stats.average) : '-',
            },
            {
              label: '최근',
              value: data.stats.latest != null ? score(data.stats.latest) : '-',
              tone: 'brand',
            },
          ]}
        />
      </Section>

      {points.length >= 2 && (
        <Section title="점수 추이" description={`최근 ${points.length}번의 시험이에요`}>
          <GrowthLineChart
            points={points}
            {...scoreDomain(points.map((p) => p.value))}
            formatValue={score}
            accessibilityLabel={`영단어 점수 추이 그래프, 최근 ${score(points[points.length - 1].value)}`}
          />
        </Section>
      )}

      <Section title="최근 시험" flush>
        {data.recent.map((item) => (
          <ListRow
            key={item.id}
            leading={
              <IconTile
                icon={item.source === 'online' ? Laptop : FileText}
                tone={item.source === 'online' ? 'info' : 'gray'}
                size={40}
              />
            }
            meta={
              <Badge tone={item.source === 'online' ? 'info' : 'gray'}>
                {item.source === 'online' ? '앱 시험' : '종이 시험'}
              </Badge>
            }
            title={
              <Text variant="t5-medium" numberOfLines={1}>
                {item.title}
              </Text>
            }
            description={
              <Text variant="t4-regular" color="neutralSubtle" tabular numberOfLines={1}>
                {`${formatDayKey(item.date)} · ${item.correct}/${item.total}개`}
              </Text>
            }
            trailing={
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="t5-bold" tabular>
                  {score(item.score)}
                </Text>
              </View>
            }
          />
        ))}
      </Section>

      <Text variant="t3-regular" color="neutralSubtle" align="center" style={{ marginTop: space.x1 }}>
        평균은 지금까지 본 모든 시험 기준이에요.
      </Text>
    </Stack>
  );
}
