import { Image } from 'expo-image';
import { MessageCircleHeart, ShieldCheck, Trophy } from 'lucide-react-native';
import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Badge,
  color,
  Divider,
  GroupLabel,
  IconTile,
  ListRow,
  Markdown,
  Notice,
  Press,
  radius,
  Section,
  space,
  Stack,
  StatGrid,
  Text,
} from '@/design';
import type { ParentMonthlyReport } from '@/lib/api/parent-monthly-report';

import { GrowthLineChart } from './growth-line-chart';
import { monthDay, num, slashDay } from './report-monthly-format';
import { FixedGrid } from './report-monthly-grid';

// 학부모 월간 리포트 표시 블록 — 웹 src/components/parent-report/monthly-sections.tsx ·
// reports/{notes-section,vocab-trend-mini-chart}.tsx 와 같은 구성·문구. 데이터는 화면이 받아 넘긴다.

type Report = ParentMonthlyReport;
type OnImage = (src: string) => void;

// ─── 첫 화면 (ReportHero + MonthlySummary) ───────────────────────────

export function MonthlyHero({ report }: { report: Report }) {
  const { student, summary } = report;
  const meta = [student.school, student.grade, student.targetUniversity && `목표 ${student.targetUniversity}`].filter(
    (m): m is string => !!m
  );
  return (
    <View style={s.hero}>
      <Text variant="t4-bold" color="brand">
        {`${report.year}년 ${report.month}월 월간 리포트`}
      </Text>
      <Text variant="t10-bold" accessibilityRole="header" style={{ marginTop: space.x1_5 }}>
        {`${student.name} 학생`}
      </Text>
      {meta.length > 0 && (
        <Text variant="t5-regular" color="neutralSubtle" style={{ marginTop: space.x1 }}>
          {meta.map((m, i) => (
            <Fragment key={i}>
              {i > 0 && <Text color="placeholder">{'  ·  '}</Text>}
              {m}
            </Fragment>
          ))}
        </Text>
      )}
      <StatGrid
        surface="plain"
        style={s.heroStats}
        items={[
          { label: '멘토링', value: `${summary.mentoringCount}회` },
          {
            label: '상점 · 벌점',
            value:
              summary.meritItemCount === 0 ? (
                <Text variant="t6-bold" color="neutralSubtle">
                  없음
                </Text>
              ) : (
                <>
                  <Text variant="t6-bold" color={summary.meritPoints > 0 ? 'positive' : 'neutral'} tabular>
                    {`+${summary.meritPoints}`}
                  </Text>
                  <Text variant="t4-regular" color="placeholder">
                    {' / '}
                  </Text>
                  <Text variant="t6-bold" color={summary.demeritPoints > 0 ? 'critical' : 'neutral'} tabular>
                    {`-${summary.demeritPoints}`}
                  </Text>
                </>
              ),
          },
          { label: '순찰 특이사항', value: `${summary.patrolNoteCount}회` },
        ]}
      />
    </View>
  );
}

// ─── ① 월간 멘토링 종합 의견 ─────────────────────────────────────────

export function MentoringSummarySection({ report, onImage }: { report: Report; onImage: OnImage }) {
  if (!report.mentoringSummary) return null;
  const n = report.summary.mentoringCount;
  return (
    <Section title="월간 멘토링 종합 의견" description={n > 0 ? `이번 달 멘토링 총 ${n}회 진행했어요` : undefined}>
      <Markdown source={report.mentoringSummary} onImagePress={onImage} />
    </Section>
  );
}

// ─── ② 원장님 한마디 ─────────────────────────────────────────────────

export function DirectorNote({ report, onImage }: { report: Report; onImage: OnImage }) {
  if (!report.directorComment) return null;
  return (
    <Section>
      <View style={s.noteHead}>
        <IconTile icon={MessageCircleHeart} tone="brand" size={40} round />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="t6-bold" accessibilityRole="header">
            원장님 한마디
          </Text>
          <Text variant="t4-regular" color="neutralSubtle">
            {`${report.student.name} 학생 학부모님께`}
          </Text>
        </View>
      </View>
      <Markdown source={report.directorComment} onImagePress={onImage} style={{ marginTop: space.x4 }} />
    </Section>
  );
}

// ─── ④ 영단어 학습 추이 ──────────────────────────────────────────────

const VOCAB_DOMAIN: [number, number] = [0, 100];
const VOCAB_TICKS = [100, 75, 50, 25, 0];

export function VocabSection({ report }: { report: Report }) {
  const v = report.vocab;
  if (!v) return null;
  const points = v.points.map((p) => ({
    key: p.id,
    label: slashDay(p.date),
    value: p.score,
    caption: `${monthDay(p.date)} · ${p.correct}/${p.total}개`,
  }));
  return (
    <Section title="영단어 학습 추이">
      <StatGrid
        items={[
          { label: '응시', value: `${v.count}회` },
          { label: '평균', value: `${num(v.average)}점` },
          { label: '최근', value: `${num(v.latest)}점`, tone: 'brand' },
        ]}
      />
      <View style={{ marginTop: space.x5 }}>
        <GrowthLineChart
          points={points}
          domain={VOCAB_DOMAIN}
          ticks={VOCAB_TICKS}
          formatValue={(x) => `${num(x)}점`}
          height={200}
          accessibilityLabel={`영단어 점수 추이 그래프, 이번 달 ${v.count}회, 최근 ${num(v.latest)}점`}
        />
      </View>
      <Text variant="t3-regular" color="neutralSubtle" style={{ marginTop: space.x2 }}>
        점수는 정답률(%) 기준이에요.
      </Text>
    </Section>
  );
}

// ─── ⑤ 원생 기록 · 상벌점 (리포트 공개 항목만) ────────────────────────

export function StudentNoteSection({ report, onImage }: { report: Report; onImage: OnImage }) {
  if (!report.note) return null;
  return (
    <Section title="원생 기록" description={`${report.year}년 ${report.month}월`}>
      <Markdown source={report.note.content} onImagePress={onImage} />
    </Section>
  );
}

export function MeritSection({ report }: { report: Report }) {
  const { merit, demerit, items } = report.merits;
  if (items.length === 0) return null;
  return (
    <Section title="상벌점" description={`${report.year}년 ${report.month}월`}>
      <StatGrid
        items={[
          {
            label: '상점',
            value: `+${merit.points}점`,
            sub: `${merit.count}건`,
            tone: merit.points > 0 ? 'positive' : 'neutral',
          },
          {
            label: '벌점',
            value: demerit.points > 0 ? `-${demerit.points}점` : '0점',
            sub: `${demerit.count}건`,
            tone: demerit.points > 0 ? 'critical' : 'neutral',
          },
          { label: '전체', value: `${items.length}건` },
        ]}
      />
      <View style={{ marginTop: space.x2 }}>
        {items.map((m, i) => {
          const isMerit = m.type === 'MERIT';
          return (
            <Fragment key={m.id}>
              {i > 0 && <Divider />}
              <View
                style={[s.meritRow, i === items.length - 1 && { paddingBottom: 0 }]}
                accessible
                accessibilityLabel={`${monthDay(m.date)} ${m.reason}, ${isMerit ? '상점' : '벌점'} ${m.points}점`}>
                <View style={{ flex: 1, minWidth: 0, gap: space.x1 }}>
                  <Text variant="t5-regular">{m.reason}</Text>
                  <View style={s.meritMeta}>
                    <Text variant="t4-regular" color="neutralSubtle" tabular>
                      {monthDay(m.date)}
                    </Text>
                    {m.category && <Badge tone="gray">{m.category}</Badge>}
                  </View>
                </View>
                <Text variant="t5-bold" color={isMerit ? 'positive' : 'critical'} tabular>
                  {`${isMerit ? '+' : '-'}${m.points}점`}
                </Text>
              </View>
            </Fragment>
          );
        })}
      </View>
    </Section>
  );
}

// ─── ⑥ 순찰 점검 ─────────────────────────────────────────────────────

export function PatrolSection({ report }: { report: Report }) {
  const { noteCount, absentCount, notes } = report.patrol;
  const clean = noteCount + absentCount === 0;
  return (
    <Section title="순찰 점검" description="자습 시간 순찰에서 확인한 내용이에요">
      {clean ? (
        <Notice tone="ok" icon={ShieldCheck}>
          이번 달 순찰에서 특이사항이 없었어요.
        </Notice>
      ) : (
        <>
          <StatGrid
            items={[
              { label: '특이사항', value: `${noteCount}회` },
              { label: '자리비움', value: `${absentCount}회` },
            ]}
          />
          {notes.length > 0 && (
            <>
              <Text variant="t4-bold" color="neutralMuted" style={{ marginTop: space.x5 }}>
                특이사항 내용
              </Text>
              <View style={{ marginTop: space.x1 }}>
                {notes.map((n, i) => (
                  <Fragment key={n.id}>
                    {i > 0 && <Divider />}
                    <View style={[s.patrolRow, i === notes.length - 1 && { paddingBottom: 0 }]}>
                      <Text variant="t4-medium" color="neutralSubtle" tabular style={s.patrolDate}>
                        {n.date}
                      </Text>
                      <Markdown source={n.note} style={{ flex: 1, minWidth: 0 }} />
                    </View>
                  </Fragment>
                ))}
              </View>
            </>
          )}
        </>
      )}
    </Section>
  );
}

// ─── ⑦ 이달의 기록 사진 ──────────────────────────────────────────────

export function PhotoSection({ report, onOpen }: { report: Report; onOpen: (index: number) => void }) {
  const photos = report.photos;
  if (photos.length === 0) return null;
  return (
    <Section
      title="이달의 기록 사진"
      description="사진을 누르면 크게 볼 수 있어요"
      action={
        <Text variant="t4-regular" color="neutralSubtle" tabular>
          {`${photos.length}장`}
        </Text>
      }>
      <FixedGrid columns={3} gap={space.x1_5}>
        {photos.map((p, i) => (
          <Press
            key={p.id}
            onPress={() => onOpen(i)}
            accessibilityRole="imagebutton"
            accessibilityLabel={`${report.month}월 기록 사진 ${i + 1}, 크게 보기`}
            style={s.photo}>
            <Image
              source={{ uri: p.thumbnailUrl ?? p.url }}
              contentFit="cover"
              transition={150}
              recyclingKey={p.id}
              style={StyleSheet.absoluteFill}
            />
          </Press>
        ))}
      </FixedGrid>
    </Section>
  );
}

// ─── ⑧ 주요 입시 정보 ────────────────────────────────────────────────

export function AdmissionSection({ report, onImage }: { report: Report; onImage: OnImage }) {
  if (!report.admissionInfo) return null;
  return (
    <Section title="주요 입시 정보">
      <Markdown source={report.admissionInfo} onImagePress={onImage} />
    </Section>
  );
}

// ─── ⑨ 독서실 공지사항 ───────────────────────────────────────────────

export function NoticesGroup({ report, onImage }: { report: Report; onImage: OnImage }) {
  const { operations, awards, recommendation } = report.notices;
  if (!operations && awards.length === 0 && !recommendation) return null;
  return (
    <View style={{ marginTop: space.x3 }}>
      <GroupLabel>독서실 공지사항</GroupLabel>
      <Stack>
        {operations && (
          <Section title="운영 일정">
            <Markdown source={operations} onImagePress={onImage} />
          </Section>
        )}
        {awards.length > 0 && (
          <Section title="이달의 시상" flush>
            {awards.map((a) => (
              <ListRow
                key={a.id}
                style={a.isMine ? { backgroundColor: color.bg.brandWeak } : undefined}
                leading={<IconTile icon={Trophy} tone={a.isMine ? 'brand' : 'gray'} solid={a.isMine} size={40} round />}
                title={
                  <View style={s.awardTitle}>
                    <Text variant="t5-medium">{a.name}</Text>
                    {a.isMine && (
                      <Badge tone="brand" solid>
                        우리 아이
                      </Badge>
                    )}
                  </View>
                }
                description={
                  <View style={{ gap: space.x0_5 }}>
                    <Text variant="t4-regular" color="neutralSubtle">
                      {a.categoryLabel}
                    </Text>
                    {a.description && (
                      <Text variant="t4-regular" color="neutralSubtle">
                        {a.description}
                      </Text>
                    )}
                  </View>
                }
              />
            ))}
          </Section>
        )}
        {recommendation && (
          <Section title="이달의 권장 과목 · 인강 · 교재">
            <Markdown source={recommendation} onImagePress={onImage} />
          </Section>
        )}
      </Stack>
    </View>
  );
}

// ─── 맨 아래 안내 ────────────────────────────────────────────────────

export function MonthlyFooter({ report }: { report: Report }) {
  return (
    <View style={s.footer}>
      <ShieldCheck color={color.fg.placeholder} size={16} strokeWidth={2} style={{ marginTop: 1 }} />
      <Text variant="t3-regular" color="neutralSubtle" align="center" style={{ flexShrink: 1 }}>
        {`${report.year}년 ${report.month}월 기준으로 작성된 리포트예요.\n학부모님께만 보여 드리는 리포트예요.`}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  hero: { paddingHorizontal: space.x1, paddingTop: space.x4, paddingBottom: space.x3 },
  heroStats: {
    marginTop: space.x5,
    borderRadius: radius.r5,
    backgroundColor: color.bg.layerDefault,
    paddingVertical: space.x5,
  },
  noteHead: { flexDirection: 'row', alignItems: 'center', gap: space.x3 },
  meritRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.x3, paddingVertical: space.x3_5 },
  meritMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.x1_5 },
  patrolRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.x3, paddingVertical: space.x3 },
  patrolDate: { width: space.x10, paddingTop: space.x1 },
  photo: {
    aspectRatio: 1,
    overflow: 'hidden',
    borderRadius: radius.r3,
    backgroundColor: color.bg.layerFill,
  },
  awardTitle: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.x1_5 },
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: space.x1_5,
    paddingHorizontal: space.x8,
    paddingTop: space.x5,
    paddingBottom: space.x4,
  },
});
