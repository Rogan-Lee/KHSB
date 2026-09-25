import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Badge,
  Chip,
  ChipGroup,
  color,
  radius,
  Section,
  Segmented,
  space,
  Text,
  useResponsive,
} from '@/design';
import type {
  MonthlyExamTrend,
  MonthlyExamType,
  MonthlyRecentExam,
  MonthlyTrendRow,
  ParentMonthlyReport,
} from '@/lib/api/parent-monthly-report';

import { MonthlyTrendChart, SeriesDot, type TrendColumn, type TrendSeries } from './report-monthly-chart';
import { longDay, num, slashDay } from './report-monthly-format';
import { FixedGrid } from './report-monthly-grid';

// ③ 모의고사 성적 — 웹 월간 리포트의 "최근 응시한 시험" 카드 + MonthlyExamTrendChart 와 같은 구성·문구.

type ViewMode = 'byType' | 'bySubject';
type Metric = 'grade' | 'percentile';

// 계열 색 — SEED 팔레트. 과목 색은 전체 과목 기준으로 고정(필터로 숨겨도 남은 과목 색이 바뀌지 않음).
// 웹 조합에서 명도 범위를 벗어난 칸(purple900·blue500·red900)과 대비가 낮은 칸(yellow500)만
// 가까운 단계로 바꿔 팔레트 검증(명도·채도·색각이상 구분·대비)을 통과시켰다.
const SUBJECT_COLORS: Record<string, string> = {
  국어: color.palette.carrot700,
  수학: color.palette.blue700,
  영어: color.palette.green700,
  한국사: color.palette.yellow700,
};
const EXTRA_SUBJECT_COLORS = [color.palette.purple800, color.palette.red800];
const FALLBACK_COLOR = color.palette.gray700;

const EXAM_TYPE_META: Record<MonthlyExamType, { label: string; color: string }> = {
  OFFICIAL_MOCK: { label: '공식 모의', color: color.palette.carrot700 },
  PRIVATE_MOCK: { label: '사설 모의', color: color.palette.blue700 },
  SCHOOL_EXAM: { label: '내신', color: color.palette.green700 },
  DUFF: { label: '더프', color: color.palette.purple800 },
};

const GRADE_TICKS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const PERCENTILE_TICKS = [0, 25, 50, 75, 100];

export function MonthlyExamsSection({ exams }: { exams: NonNullable<ParentMonthlyReport['exams']> }) {
  return (
    <Section title="모의고사 성적">
      {exams.recent.length > 0 && (
        <View style={{ marginBottom: space.x6 }}>
          <Text variant="t5-bold" style={{ marginBottom: space.x3 }}>
            최근 응시한 시험
          </Text>
          <RecentExams groups={exams.recent} />
        </View>
      )}
      <Text variant="t5-bold" style={{ marginBottom: space.x3 }}>
        성적 추이
      </Text>
      <ExamTrend trend={exams.trend} />
    </Section>
  );
}

// ─── 최근 응시한 시험 ────────────────────────────────────────────────

function RecentExams({ groups }: { groups: MonthlyRecentExam[] }) {
  const { isTablet } = useResponsive();
  const hasThisMonth = groups.some((g) => g.isThisMonth);
  return (
    <View style={{ gap: space.x2_5 }}>
      {groups.map((g) => {
        const tag = g.isThisMonth ? '이번 달' : hasThisMonth ? '직전' : null;
        return (
          <View
            key={g.key}
            style={[s.examCard, { backgroundColor: g.isThisMonth ? color.bg.brandWeak : color.bg.layerFill }]}>
            <View style={s.examHead}>
              <Badge tone="gray">{g.typeLabel}</Badge>
              {tag && (
                <Badge tone={g.isThisMonth ? 'brand' : 'gray'} solid={g.isThisMonth} style={{ marginLeft: 'auto' }}>
                  {tag}
                </Badge>
              )}
            </View>
            <Text variant="t5-bold" style={{ marginTop: space.x2 }}>
              {g.name}
            </Text>
            <Text variant="t4-regular" color="neutralSubtle" tabular style={{ marginTop: space.x0_5 }}>
              {longDay(g.date)}
            </Text>
            <View style={{ marginTop: space.x3 }}>
              <FixedGrid columns={isTablet ? 4 : 3} gap={space.x1_5}>
                {g.subjects.map((sub, i) => (
                  <View
                    key={`${sub.subject}-${i}`}
                    style={s.subjectCell}
                    accessible
                    accessibilityLabel={`${sub.subject} ${
                      sub.grade != null ? `${sub.grade}등급` : sub.rawScore != null ? `${sub.rawScore}점` : '기록 없음'
                    }`}>
                    <Text variant="t3-regular" color="neutralSubtle" numberOfLines={1}>
                      {sub.subject}
                    </Text>
                    {sub.grade != null || sub.rawScore != null ? (
                      <Text variant="t5-bold" tabular numberOfLines={1}>
                        {sub.grade != null ? sub.grade : sub.rawScore}
                        <Text variant="t3-medium" color="neutralMuted">
                          {sub.grade != null ? ' 등급' : ' 점'}
                        </Text>
                      </Text>
                    ) : (
                      <Text variant="t5-bold" color="placeholder">
                        —
                      </Text>
                    )}
                  </View>
                ))}
              </FixedGrid>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─── 성적 추이 ───────────────────────────────────────────────────────

function subjectColorMap(subjects: string[]) {
  const map: Record<string, string> = {};
  let extra = 0;
  for (const sub of subjects) {
    map[sub] = SUBJECT_COLORS[sub] ?? EXTRA_SUBJECT_COLORS[extra++] ?? FALLBACK_COLOR;
  }
  return map;
}

/** 계열마다 가장 최근 값과 그 직전 값 */
function latestOf(rows: MonthlyTrendRow[], metric: Metric, key: string) {
  let value: number | null = null;
  let prev: number | null = null;
  for (const row of rows) {
    const v = row[metric][key];
    if (v != null) {
      prev = value;
      value = v;
    }
  }
  return { value, prev };
}

function ExamTrend({ trend }: { trend: MonthlyExamTrend }) {
  const [view, setView] = useState<ViewMode>('byType');
  const [metric, setMetric] = useState<Metric>('grade');
  const [picked, setPicked] = useState<string[] | null>(null);

  const colors = subjectColorMap(trend.subjects);
  const visibleSubjects = picked ? trend.subjects.filter((sub) => picked.includes(sub)) : trend.subjects;

  const series: TrendSeries[] =
    view === 'byType'
      ? trend.examTypes.map((t) => ({ key: t, label: EXAM_TYPE_META[t].label, color: EXAM_TYPE_META[t].color }))
      : visibleSubjects.map((sub) => ({ key: sub, label: sub, color: colors[sub] }));
  const rows = view === 'byType' ? trend.byType : trend.bySubject;

  const columns: TrendColumn[] = rows.flatMap((row) => {
    const values: Record<string, number> = {};
    for (const se of series) {
      const v = row[metric][se.key];
      if (v != null) values[se.key] = v;
    }
    return Object.keys(values).length === 0
      ? []
      : [{ key: row.key, label: slashDay(row.date), title: row.title || longDay(row.date), sub: longDay(row.date), values }];
  });

  const cells = series.flatMap((se) => {
    const l = latestOf(rows, metric, se.key);
    return l.value != null ? [{ ...se, value: l.value, prev: l.prev }] : [];
  });

  const toggleSubject = (sub: string) =>
    setPicked((prev) => {
      if (prev === null) return [sub];
      const next = prev.includes(sub) ? prev.filter((x) => x !== sub) : [...prev, sub];
      return next.length === 0 ? null : next;
    });

  const formatValue = (v: number) => (metric === 'grade' ? `${num(v)}등급` : num(v));
  const hasData = columns.length > 0;
  const summaryCols = cells.length === 1 ? 1 : cells.length === 2 || cells.length === 4 ? 2 : 3;

  return (
    <View style={{ gap: space.x4 }}>
      <Segmented<ViewMode>
        value={view}
        onChange={setView}
        options={[
          { value: 'byType', label: '시험 종류별' },
          { value: 'bySubject', label: '과목별' },
        ]}
      />

      {/* 과목별: 과목 고르기 (색 점 = 범례) */}
      {view === 'bySubject' && trend.subjects.length > 0 && (
        <ChipGroup style={{ gap: space.x1_5 }}>
          <Chip size="sm" selected={picked === null} onPress={() => setPicked(null)}>
            전체
          </Chip>
          {trend.subjects.map((sub) => {
            const on = picked?.includes(sub) ?? false;
            return (
              <Chip key={sub} size="sm" selected={on} onPress={() => toggleSubject(sub)}>
                <View style={s.chipLabel}>
                  <SeriesDot color={colors[sub]} />
                  <Text variant="t4-medium" color={on ? color.fg.neutralInverted : color.fg.neutral} numberOfLines={1}>
                    {sub}
                  </Text>
                </View>
              </Chip>
            );
          })}
        </ChipGroup>
      )}

      {/* 최근 결과 + 지표 전환 */}
      <View style={{ gap: space.x2_5 }}>
        <View style={s.metricRow}>
          <Text variant="t4-bold" color="neutralMuted" style={{ flexShrink: 1 }}>
            {view === 'byType' ? '가장 최근 평균' : '과목별 최근 성적'}
          </Text>
          <View style={{ flexDirection: 'row', gap: space.x1 }} accessibilityRole="radiogroup" accessibilityLabel="성적 기준">
            <Chip size="sm" selected={metric === 'grade'} onPress={() => setMetric('grade')}>
              등급
            </Chip>
            <Chip size="sm" selected={metric === 'percentile'} onPress={() => setMetric('percentile')}>
              백분위
            </Chip>
          </View>
        </View>

        {hasData && cells.length > 0 && (
          <FixedGrid columns={summaryCols}>
            {cells.map((c) => (
              <LatestCell key={c.key} label={c.label} color={c.color} value={c.value} prev={c.prev} metric={metric} />
            ))}
          </FixedGrid>
        )}
      </View>

      {!hasData ? (
        <View style={s.noData}>
          <Text variant="t4-regular" color="neutralSubtle" align="center">
            {metric === 'grade' ? '등급이' : '백분위가'} 입력된 시험이 아직 없어요
          </Text>
        </View>
      ) : (
        <>
          {view === 'byType' && series.length > 0 && (
            <View style={s.legend} accessibilityLabel="범례">
              {series.map((se) => (
                <View key={se.key} style={s.legendItem}>
                  <SeriesDot color={se.color} />
                  <Text variant="t3-medium" color="neutralMuted">
                    {se.label}
                  </Text>
                </View>
              ))}
            </View>
          )}
          <MonthlyTrendChart
            key={`${view}-${metric}`}
            columns={columns}
            series={series}
            domain={metric === 'grade' ? [1, 9] : [0, 100]}
            ticks={metric === 'grade' ? GRADE_TICKS : PERCENTILE_TICKS}
            invert={metric === 'grade'}
            reference={metric === 'grade' ? { value: 3, label: '3등급' } : undefined}
            formatValue={formatValue}
            emphasize={view === 'bySubject' && picked?.length === 1}
            accessibilityLabel={`${view === 'byType' ? '시험 종류별' : '과목별'} ${
              metric === 'grade' ? '등급' : '백분위'
            } 추이 그래프, 시험 ${columns.length}회`}
          />
          <Text variant="t3-regular" color="neutralSubtle">
            {metric === 'grade' ? '등급은 숫자가 작을수록 좋아요. ' : '백분위는 숫자가 클수록 좋아요. '}
            {view === 'byType'
              ? "시험 종류별 과목 평균이에요. 과목별 흐름은 '과목별'에서 볼 수 있어요."
              : '과목을 누르면 그 과목만 골라 볼 수 있어요.'}
          </Text>
        </>
      )}
    </View>
  );
}

/** 최근 값 칸 — 색 점으로 계열 표시, 숫자는 본문색. ▲ = 직전보다 좋아짐 */
function LatestCell({
  label,
  color: dot,
  value,
  prev,
  metric,
}: {
  label: string;
  color: string;
  value: number;
  prev: number | null;
  metric: Metric;
}) {
  const diff = prev != null ? value - prev : null;
  const better = diff == null ? false : metric === 'grade' ? diff < 0 : diff > 0;
  const size = diff != null ? Math.round(Math.abs(diff) * 100) / 100 : null;
  return (
    <View style={s.latestCell}>
      <View style={s.latestLabel}>
        <SeriesDot color={dot} />
        <Text variant="t3-medium" color="neutralMuted" numberOfLines={1} style={{ flexShrink: 1 }}>
          {label}
        </Text>
      </View>
      <Text variant="t6-bold" tabular numberOfLines={1}>
        {num(value)}
        {metric === 'grade' && (
          <Text variant="t3-medium" color="neutralMuted">
            {' 등급'}
          </Text>
        )}
      </Text>
      {size != null && size !== 0 ? (
        <Text
          variant="t2-bold"
          color={better ? 'positive' : 'critical'}
          tabular
          accessibilityLabel={`직전보다 ${size} ${better ? '좋아졌어요' : '내려갔어요'}`}>
          {`${better ? '▲' : '▼'} ${num(size)}`}
        </Text>
      ) : size === 0 ? (
        <Text variant="t2-regular" color="neutralSubtle">
          직전과 같아요
        </Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  examCard: { borderRadius: radius.r4, padding: space.x4 },
  examHead: { flexDirection: 'row', alignItems: 'center', gap: space.x1_5 },
  subjectCell: {
    flexGrow: 1,
    alignItems: 'center',
    gap: space.x0_5,
    borderRadius: radius.r3,
    backgroundColor: color.bg.layerDefault,
    paddingHorizontal: space.x1_5,
    paddingVertical: space.x2_5,
  },
  chipLabel: { flexDirection: 'row', alignItems: 'center', gap: space.x1_5 },
  metricRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.x2 },
  noData: {
    borderRadius: radius.r3,
    backgroundColor: color.bg.layerFill,
    paddingVertical: space.x8,
    paddingHorizontal: space.x4,
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.x3, rowGap: space.x1 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.x1_5 },
  latestCell: {
    flexGrow: 1,
    gap: space.x1,
    borderRadius: radius.r3,
    backgroundColor: color.bg.layerFill,
    paddingHorizontal: space.x3,
    paddingVertical: space.x3,
  },
  latestLabel: { flexDirection: 'row', alignItems: 'center', gap: space.x1_5, minWidth: 0 },
});
