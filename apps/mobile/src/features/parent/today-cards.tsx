import { FileText, Megaphone, Smartphone } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import {
  Badge,
  BottomSheet,
  Button,
  Divider,
  IconTile,
  InfoRow,
  ListRow,
  Section,
  SectionAction,
  Skeleton,
  StatGrid,
  Stack,
  Text,
  color,
  radius,
  space,
  type Tone,
} from '@/design';
import type { ParentStudyStatsResponse, ParentTodayResponse } from '@/lib/api/parent-today';

import { StudyBars, StudySummary } from './attendance-study-chart';
import { dayShort, dayTitle, duration, kstToday, plainText } from './today-format';
import { DayTimeline, buildTimeline } from './today-timeline';

const ATTENDANCE_TAB = '/(parent)/(tabs)/attendance' as const;
const REPORTS_TAB = '/(parent)/(tabs)/reports' as const;

// ─── 오늘 하루 타임라인 ──────────────────────────────────────────────

const PHONE_TONE: Record<NonNullable<ParentTodayResponse['phoneCheck']>['status'], Tone> = {
  SUBMITTED: 'ok',
  NOT_SUBMITTED: 'warn',
  ABSENT: 'gray',
  EXEMPT: 'gray',
};

const PHONE_SHORT: Record<NonNullable<ParentTodayResponse['phoneCheck']>['status'], string> = {
  SUBMITTED: '제출',
  NOT_SUBMITTED: '미제출',
  ABSENT: '입실 전',
  EXEMPT: '면제',
};

export function TodayTimelineCard({ today }: { today: ParentTodayResponse }) {
  const events = buildTimeline(today, {
    naps: today.naps,
    overdue: today.overdue,
    now: today.now,
    live: true,
  });
  const nothingYet =
    !today.checkIn && today.status !== '결석' && !today.expected.start && today.naps.length === 0;

  return (
    <Section title="오늘 하루" description={`${dayTitle(today.date)} · 예정과 실제 기록`}>
      {nothingYet ? (
        <Text variant="t5-regular" color="neutralMuted">
          입실하면 여기에 오늘 기록이 차례로 쌓여요.
        </Text>
      ) : (
        <DayTimeline events={events} />
      )}
      {today.phoneCheck && (
        <>
          <Divider style={{ marginTop: space.x4, marginBottom: space.x2 }} />
          <InfoRow
            label={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x2 }}>
                <Smartphone color={color.fg.neutralSubtle} size={18} strokeWidth={2} />
                <Text variant="t5-regular" color="neutralSubtle">
                  휴대폰 제출
                </Text>
              </View>
            }>
            <Badge tone={PHONE_TONE[today.phoneCheck.status]} size="md">
              {PHONE_SHORT[today.phoneCheck.status]}
            </Badge>
          </InfoRow>
        </>
      )}
    </Section>
  );
}

// ─── 이번 주 공부 시간 (미니 막대) ───────────────────────────────────

export function WeekStudyCard({
  stats,
  loading,
}: {
  stats: ParentStudyStatsResponse | null;
  loading: boolean;
}) {
  return (
    <Section
      title="이번 주 공부 시간"
      action={<SectionAction href={ATTENDANCE_TAB}>자세히</SectionAction>}>
      {!stats ? (
        loading ? (
          <View style={{ gap: space.x3 }}>
            <Skeleton style={{ width: 160, height: 32 }} />
            <Skeleton style={{ height: 96, borderRadius: radius.r3 }} />
          </View>
        ) : (
          <Text variant="t4-regular" color="neutralSubtle">
            공부 시간을 불러오지 못했어요.
          </Text>
        )
      ) : (
        <Stack gap={space.x5}>
          <StudySummary stats={stats} label="이번 주 합계" size="md" />
          <StudyBars days={stats.days} mode="week" compact />
          {stats.dailyAverageMinutes > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space.x3, rowGap: space.x1 }}>
              <Text variant="t4-regular" color="neutralMuted">
                하루 평균 {duration(stats.dailyAverageMinutes)}
              </Text>
              {stats.gradeAverage && (
                <Text variant="t4-regular" color="neutralSubtle">
                  같은 학년 평균 {duration(stats.gradeAverage.dailyMinutes)}
                </Text>
              )}
            </View>
          )}
        </Stack>
      )}
    </Section>
  );
}

// ─── 이번 달 상벌점 ──────────────────────────────────────────────────

export function MonthPointsCard({
  month,
  points,
}: {
  month: number;
  points: { merit: number; demerit: number } | null;
}) {
  return (
    <Section title={`${month}월 상벌점`} description="리포트에 공개된 기록만 보여드려요">
      {points ? (
        <StatGrid
          items={[
            { label: '상점', value: `+${points.merit}`, tone: points.merit > 0 ? 'positive' : 'neutral' },
            { label: '벌점', value: points.demerit > 0 ? `-${points.demerit}` : '0', tone: points.demerit > 0 ? 'critical' : 'neutral' },
            {
              label: '합계',
              value: `${points.merit - points.demerit > 0 ? '+' : ''}${points.merit - points.demerit}`,
            },
          ]}
        />
      ) : (
        <Skeleton style={{ height: 76, borderRadius: radius.r4 }} />
      )}
    </Section>
  );
}

// ─── 최근 리포트 ─────────────────────────────────────────────────────

export function LatestReportCard({
  latestReportAt,
  now,
}: {
  latestReportAt: string | null | undefined;
  /** 기준 시각 (오늘 응답의 서버 시각) */
  now: string;
}) {
  const fresh =
    !!latestReportAt &&
    new Date(now).getTime() - new Date(latestReportAt).getTime() < 7 * 24 * 60 * 60 * 1000;
  return (
    <Section flush>
      <ListRow
        href={REPORTS_TAB}
        leading={<IconTile icon={FileText} tone="brand" size={44} />}
        meta={fresh ? <Badge tone="brand">새 리포트</Badge> : undefined}
        title="최근 리포트"
        description={
          latestReportAt === undefined
            ? '확인하고 있어요'
            : latestReportAt
              ? `${dayShort(kstToday(new Date(latestReportAt)))}에 받았어요`
              : '아직 받은 리포트가 없어요'
        }
        style={{ paddingVertical: space.x4 }}
      />
    </Section>
  );
}

// ─── 독서실 공지 ─────────────────────────────────────────────────────

export function NoticeCard({ notice }: { notice: NonNullable<ParentTodayResponse['notice']> }) {
  const [open, setOpen] = useState(false);
  const body = plainText(notice.content);
  const posted = kstToday(new Date(notice.updatedAt ?? notice.createdAt));
  return (
    <>
      <Section flush>
        <ListRow
          onPress={() => setOpen(true)}
          align="start"
          leading={<IconTile icon={Megaphone} tone="info" size={44} />}
          meta={
            <Text variant="t3-medium" color="neutralSubtle">
              독서실 공지 · {dayShort(posted)}
            </Text>
          }
          title={
            <Text variant="t5-bold" numberOfLines={1}>
              {notice.title}
            </Text>
          }
          description={
            <Text variant="t4-regular" color="neutralMuted" numberOfLines={2}>
              {body}
            </Text>
          }
          style={{ paddingVertical: space.x4 }}
        />
      </Section>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={notice.title}
        description={`${dayTitle(posted)}에 올라온 공지예요`}
        footer={
          <View style={{ flex: 1 }}>
            <Button variant="gray" size="lg" block onPress={() => setOpen(false)}>
              확인
            </Button>
          </View>
        }>
        <Text variant="t5-regular" style={{ lineHeight: 26 }}>
          {body}
        </Text>
      </BottomSheet>
    </>
  );
}
