import { ChevronDown, GraduationCap } from 'lucide-react-native';
import { Fragment, useState } from 'react';
import { View } from 'react-native';

import {
  Badge,
  Button,
  Chip,
  ChipGroup,
  color,
  Divider,
  EmptyState,
  radius,
  Section,
  space,
  Stack,
  Text,
  type Tone,
} from '@/design';
import type { ParentExamGroup, ParentExamsResponse } from '@/lib/api/parent-reports';

import { GrowthLineChart, gradeDomain } from './growth-line-chart';
import { formatDayKey, formatDecimal, shortDayKey } from './report-format';

const TYPE_TONE: Record<string, Tone> = {
  OFFICIAL_MOCK: 'info',
  PRIVATE_MOCK: 'violet',
  DUFF: 'violet',
  SCHOOL_EXAM: 'ok',
};

const AVG = '__avg';
const INITIAL_GROUPS = 5;

const grade = (v: number) => `${formatDecimal(v)}등급`;

/** 성장 · 성적 — 모의고사 등급 추이 + 과목별 변화 + 최근 시험 */
export function GrowthExams({ data }: { data: ParentExamsResponse }) {
  const [subject, setSubject] = useState(AVG);
  const [expanded, setExpanded] = useState(false);

  if (data.groups.length === 0) {
    return (
      <Section>
        <EmptyState
          icon={GraduationCap}
          title="아직 등록된 성적이 없어요"
          description={'모의고사·내신 성적이 등록되면\n흐름을 한눈에 보여 드려요.'}
        />
      </Section>
    );
  }

  const active = subject === AVG || data.trendSubjects.includes(subject) ? subject : AVG;
  const points = data.trend.flatMap((t) => {
    const v = active === AVG ? t.averageGrade : t.grades[active];
    return v == null ? [] : [{ key: t.key, label: shortDayKey(t.date), value: v, caption: t.name }];
  });
  const latest = points[points.length - 1];
  const prev = points[points.length - 2];
  const delta = latest && prev ? Math.round((prev.value - latest.value) * 10) / 10 : null;
  const groups = expanded ? data.groups : data.groups.slice(0, INITIAL_GROUPS);

  return (
    <Stack>
      {data.trend.length > 0 && (
        <Section
          title="모의고사 등급 추이"
          description={active === AVG ? '국어·수학·영어·탐구 평균 등급이에요' : `${active} 등급이에요`}>
          {data.trendSubjects.length > 0 && (
            <ChipGroup style={{ marginBottom: space.x4 }}>
              <Chip size="sm" selected={active === AVG} onPress={() => setSubject(AVG)}>
                평균
              </Chip>
              {data.trendSubjects.map((sub) => (
                <Chip key={sub} size="sm" selected={active === sub} onPress={() => setSubject(sub)}>
                  {sub}
                </Chip>
              ))}
            </ChipGroup>
          )}

          {latest && (
            <View style={{ gap: space.x0_5, marginBottom: space.x2 }}>
              <Text variant="t4-regular" color="neutralSubtle" numberOfLines={1}>
                {`최근 · ${latest.caption}`}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: space.x2 }}>
                <Text variant="t10-bold">{grade(latest.value)}</Text>
                {delta != null && (
                  <Text
                    variant="t4-bold"
                    color={delta > 0 ? 'positive' : delta < 0 ? 'critical' : 'neutralSubtle'}>
                    {delta > 0
                      ? `지난번보다 ${formatDecimal(delta)}등급 올랐어요`
                      : delta < 0
                        ? `지난번보다 ${formatDecimal(-delta)}등급 내려갔어요`
                        : '지난번과 같아요'}
                  </Text>
                )}
              </View>
            </View>
          )}

          {points.length >= 2 ? (
            <GrowthLineChart
              points={points}
              invert
              {...gradeDomain(points.map((p) => p.value))}
              formatValue={grade}
              accessibilityLabel={`${active === AVG ? '평균' : active} 등급 추이 그래프, 최근 ${grade(points[points.length - 1].value)}`}
            />
          ) : (
            <Text variant="t4-regular" color="neutralSubtle">
              모의고사가 두 번 이상 쌓이면 추이를 그래프로 보여 드려요.
            </Text>
          )}
        </Section>
      )}

      {data.subjectChanges.length > 0 && (
        <Section title="과목별 변화" description="처음 본 모의고사와 가장 최근 모의고사를 비교했어요" flush>
          {data.subjectChanges.map((c) => (
            <View
              key={c.subject}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.x3,
                paddingHorizontal: space.x5,
                paddingVertical: space.x3,
              }}
              accessible
              accessibilityLabel={`${c.subject}, ${c.first}등급에서 ${c.latest}등급`}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="t5-medium" numberOfLines={1}>
                  {c.subject}
                </Text>
                <Text variant="t3-regular" color="neutralSubtle" numberOfLines={1}>
                  {`${c.firstExam} → ${c.latestExam}`}
                </Text>
              </View>
              <Text variant="t5-medium" tabular>
                {`${c.first} → ${c.latest}등급`}
              </Text>
              <Badge tone={c.change > 0 ? 'ok' : c.change < 0 ? 'bad' : 'gray'} size="md">
                {c.change > 0 ? `▲ ${c.change}` : c.change < 0 ? `▼ ${-c.change}` : '유지'}
              </Badge>
            </View>
          ))}
        </Section>
      )}

      <Section title="최근 시험">
        {groups.map((g, i) => (
          <Fragment key={g.key}>
            {i > 0 && <Divider style={{ marginVertical: space.x4 }} />}
            <ExamGroupBlock group={g} />
          </Fragment>
        ))}
        {data.groups.length > INITIAL_GROUPS && (
          <Button
            variant="gray"
            size="md"
            block
            iconRight={expanded ? undefined : ChevronDown}
            onPress={() => setExpanded((v) => !v)}
            style={{ marginTop: space.x5 }}>
            {expanded ? '접기' : `시험 ${data.groups.length - INITIAL_GROUPS}개 더 보기`}
          </Button>
        )}
      </Section>
    </Stack>
  );
}

function ExamGroupBlock({ group: g }: { group: ParentExamGroup }) {
  return (
    <View style={{ gap: space.x1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x1_5, flexWrap: 'wrap' }}>
        <Badge tone={TYPE_TONE[g.type] ?? 'gray'}>{g.typeLabel}</Badge>
        <Text variant="t3-regular" color="neutralSubtle" tabular>
          {formatDayKey(g.date)}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.x2 }}>
        <Text variant="t5-bold" numberOfLines={2} style={{ flex: 1 }}>
          {g.name}
        </Text>
        {g.averageGrade != null && (
          <Text variant="t4-medium" color="neutralMuted" tabular>
            {`평균 ${grade(g.averageGrade)}`}
          </Text>
        )}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.x2, marginTop: space.x2 }}>
        {g.subjects.map((sub, i) => (
          <View
            key={`${sub.subject}-${i}`}
            accessible
            accessibilityLabel={`${sub.subject} ${sub.grade != null ? `${sub.grade}등급` : sub.rawScore != null ? `${sub.rawScore}점` : '기록 없음'}`}
            style={{
              flexGrow: 1,
              flexBasis: '22%',
              minWidth: 72,
              paddingVertical: space.x2_5,
              paddingHorizontal: space.x2,
              borderRadius: radius.r3,
              backgroundColor: color.bg.layerFill,
              alignItems: 'center',
              gap: space.x0_5,
            }}>
            <Text variant="t3-regular" color="neutralSubtle" numberOfLines={1}>
              {sub.subject}
            </Text>
            <Text variant="t6-bold" tabular numberOfLines={1}>
              {sub.grade != null ? `${sub.grade}등급` : sub.rawScore != null ? `${sub.rawScore}점` : '-'}
            </Text>
            {sub.grade != null && sub.rawScore != null && (
              <Text variant="t2-regular" color="neutralSubtle" tabular numberOfLines={1}>
                {`${sub.rawScore}점`}
              </Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}
