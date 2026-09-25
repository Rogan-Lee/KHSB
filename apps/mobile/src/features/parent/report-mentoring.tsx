import {
  CalendarDays,
  Clock,
  FileText,
  MessageCircle,
  StickyNote,
  Target,
  TrendingUp,
  UserRound,
  Wrench,
  type LucideIcon,
} from 'lucide-react-native';
import { Fragment, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import {
  Badge,
  Chip,
  ChipGroup,
  Columns,
  Divider,
  EmptyState,
  Markdown,
  Section,
  Segmented,
  space,
  Stack,
  StatGrid,
  TABLET_CONTENT_WIDTH,
  Text,
  type Tone,
} from '@/design';
import type {
  MentoringSectionKey,
  ParentMentoringReport,
  ParentReportExamPoint,
} from '@/lib/api/parent-reports';

import { GrowthLineChart, gradeDomain, scoreDomain } from './growth-line-chart';
import {
  formatDayKey,
  formatDayKeyLong,
  formatDecimal,
  monthDayOfKey,
  shortDayKey,
} from './report-format';
import { CardTitle, InfoCard, PhotoList, ReportHero, SubHeading } from './report-parts';

// 학부모 멘토링 리포트 — 웹 /r/[token] (SEED) 과 같은 항목·순서·문구.
//  머리글(날짜 · 완료 · 학생 · 세션 정보) → 멘토 안내사항 → 멘토링 항목별 카드 → 영단어 → 원생 기록 · 상벌점
//  → 학습 계획 → 성적 현황. 태블릿(wide)은 왼쪽 본문 · 오른쪽 숫자·그래프 두 단.

const SECTION_LOOK: Record<MentoringSectionKey, { icon: LucideIcon; tone: Tone }> = {
  content: { icon: FileText, tone: 'gray' },
  improvements: { icon: TrendingUp, tone: 'ok' },
  weaknesses: { icon: Wrench, tone: 'warn' },
  nextGoals: { icon: Target, tone: 'brand' },
  notes: { icon: StickyNote, tone: 'gray' },
};

const score = (v: number) => `${formatDecimal(v)}점`;
const grade = (v: number) => `${formatDecimal(v)}등급`;

export function MentoringReportBody({ data, wide = false }: { data: ParentMentoringReport; wide?: boolean }) {
  const s = data.session;
  const hasText = !!data.message || data.sections.length > 0;

  const hero = (
    <ReportHero
      key="hero"
      eyebrow={`${monthDayOfKey(s.date)} ${s.hasMentoring ? '멘토링' : '리포트'}`}
      title={`${data.student.name} 학생`}
      meta={[data.student.grade, data.student.school]}
      badge={s.completed ? <Badge tone="ok">완료</Badge> : undefined}>
      <InfoCard
        rows={[
          { icon: CalendarDays, label: s.hasMentoring ? '날짜' : '작성일', value: formatDayKeyLong(s.date) },
          s.time && { icon: Clock, label: '시간', value: s.time },
          s.mentorName && { icon: UserRound, label: '담당 멘토', value: s.mentorName },
        ]}
      />
    </ReportHero>
  );

  // 멘토링 본문 — 안내사항 + 항목별 카드 (빈 항목은 서버가 이미 뺐다)
  const content: ReactNode[] = [];
  if (data.message) {
    content.push(
      <Section
        key="message"
        title={
          <CardTitle icon={MessageCircle} tone="info">
            멘토 안내사항
          </CardTitle>
        }>
        <Markdown source={data.message} style={{ paddingTop: space.x1 }} />
      </Section>
    );
  }
  for (const sec of data.sections) {
    const look = SECTION_LOOK[sec.key] ?? SECTION_LOOK.content;
    content.push(
      <Section
        key={sec.key}
        title={
          <CardTitle icon={look.icon} tone={look.tone}>
            {sec.title}
          </CardTitle>
        }>
        <Markdown source={sec.body} style={{ paddingTop: space.x1 }} />
      </Section>
    );
  }
  if (!hasText) {
    content.push(
      <Section key="empty">
        <EmptyState
          icon={FileText}
          title="아직 작성된 멘토링 내용이 없어요"
          description={'멘토링이 끝나면 담당 멘토가 내용을 정리해\n이곳에 올려 드려요.'}
          style={{ paddingVertical: space.x8 }}
        />
      </Section>
    );
  }

  const period = `${data.period.year}년 ${data.period.month}월`;
  const vocab = data.vocab ? <VocabSection key="vocab" vocab={data.vocab} month={data.period.month} /> : null;
  const note = data.monthlyNote ? (
    <Section key="note" title="원생 기록" description={period}>
      <Markdown source={data.monthlyNote} />
    </Section>
  ) : null;
  const merits = data.merits ? <MeritSection key="merits" merits={data.merits} period={period} /> : null;
  const plan = data.studyPlan ? <StudyPlanSection key="plan" plan={data.studyPlan} /> : null;
  const scores = data.scores ? <ScoresSection key="scores" scores={data.scores} /> : null;

  if (!wide) {
    // 폰 — 웹과 같은 순서
    return (
      <Stack>
        {hero}
        {content}
        {vocab}
        {note}
        {merits}
        {plan}
        {scores}
      </Stack>
    );
  }

  const right = [vocab, note, merits, scores].filter(Boolean);
  if (right.length === 0) {
    return (
      <Stack style={{ maxWidth: TABLET_CONTENT_WIDTH, width: '100%', alignSelf: 'center' }}>
        {hero}
        {content}
        {plan}
      </Stack>
    );
  }
  // 태블릿 — 왼쪽: 머리글 · 멘토링 본문 · 학습 계획 / 오른쪽: 영단어 · 생활 · 성적
  return (
    <Columns
      left={
        <>
          {hero}
          {content}
          {plan}
        </>
      }
      right={
        <>
          <View style={{ height: space.x1 }} />
          {right}
        </>
      }
    />
  );
}

// ─── 영단어 ──────────────────────────────────────────────────────────

function VocabSection({ vocab, month }: { vocab: NonNullable<ParentMentoringReport['vocab']>; month: number }) {
  const points = vocab.points.map((p) => ({
    key: p.id,
    label: shortDayKey(p.date),
    value: p.score,
    caption: `${formatDayKey(p.date)} · ${p.source === 'online' ? '앱 시험' : '종이 시험'}`,
  }));
  return (
    <Section title={`${month}월 영단어 테스트 결과`}>
      <StatGrid
        items={[
          { label: '응시', value: `${vocab.count}회` },
          { label: '평균', value: score(vocab.average) },
          { label: '최근', value: score(vocab.latest), tone: 'brand' },
        ]}
      />
      {points.length >= 2 && (
        <View style={{ marginTop: space.x5 }}>
          <GrowthLineChart
            points={points}
            {...scoreDomain(points.map((p) => p.value))}
            formatValue={score}
            accessibilityLabel={`${month}월 영단어 점수 추이 그래프, 최근 ${score(vocab.latest)}`}
          />
        </View>
      )}
      <Text variant="t3-regular" color="neutralSubtle" style={{ marginTop: space.x2 }}>
        점수는 정답률(%) 기준이에요.
      </Text>
    </Section>
  );
}

// ─── 상벌점 ──────────────────────────────────────────────────────────

function MeritSection({
  merits,
  period,
}: {
  merits: NonNullable<ParentMentoringReport['merits']>;
  period: string;
}) {
  const { merit, demerit, items } = merits;
  return (
    <Section title="상벌점" description={period}>
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
          const plus = m.type === 'MERIT';
          return (
            <Fragment key={m.id}>
              {i > 0 && <Divider />}
              <View
                accessible
                accessibilityLabel={`${monthDayOfKey(m.date)} ${m.reason}, ${plus ? '상점' : '벌점'} ${m.points}점`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: space.x3,
                  paddingTop: space.x3_5,
                  paddingBottom: i === items.length - 1 ? 0 : space.x3_5,
                }}>
                <View style={{ flex: 1, minWidth: 0, gap: space.x1 }}>
                  <Text variant="t5-regular">{m.reason}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.x1_5 }}>
                    <Text variant="t4-regular" color="neutralSubtle" tabular>
                      {monthDayOfKey(m.date)}
                    </Text>
                    {m.category ? <Badge tone="gray">{m.category}</Badge> : null}
                  </View>
                </View>
                <Text variant="t5-bold" color={plus ? 'positive' : 'critical'} tabular>
                  {plus ? `+${m.points}점` : `-${m.points}점`}
                </Text>
              </View>
            </Fragment>
          );
        })}
      </View>
    </Section>
  );
}

// ─── 학습 계획 ───────────────────────────────────────────────────────

function StudyPlanSection({ plan }: { plan: NonNullable<ParentMentoringReport['studyPlan']> }) {
  return (
    <Section title="학습 계획">
      {plan.note ? <Markdown source={plan.note} /> : null}
      {plan.images.length > 0 && (
        <View style={plan.note ? { marginTop: space.x5 } : undefined}>
          <PhotoList images={plan.images} alt="학습 계획" />
        </View>
      )}
    </Section>
  );
}

// ─── 성적 현황 ───────────────────────────────────────────────────────

function ScoresSection({ scores }: { scores: NonNullable<ParentMentoringReport['scores']> }) {
  const avg = scores.avgImprovement;
  return (
    <Section title="성적 현황">
      <StatGrid
        items={[
          {
            label: '평균 등급 변화',
            value: avg != null ? `${avg > 0 ? '+' : ''}${formatDecimal(avg)}` : '-',
            tone: avg == null || avg === 0 ? 'neutral' : avg > 0 ? 'positive' : 'critical',
          },
          { label: '멘토링 횟수', value: `${scores.mentoringCount}회` },
          { label: '총 재원 시간', value: scores.studyHours > 0 ? `${scores.studyHours}시간` : '-' },
        ]}
      />

      <ExamTrend exams={scores.exams} />

      {scores.subjects.length > 0 && (
        <View style={{ marginTop: space.x6 }}>
          <SubHeading hint="처음 본 시험과 가장 최근 시험의 등급을 비교했어요.">과목별 등급 변화</SubHeading>
          <View style={{ marginTop: space.x1 }}>
            {scores.subjects.map((sub, i) => (
              <Fragment key={sub.subject}>
                {i > 0 && <Divider />}
                <SubjectRow subject={sub} last={i === scores.subjects.length - 1} />
              </Fragment>
            ))}
          </View>
        </View>
      )}
    </Section>
  );
}

type Track = 'mock' | 'school';
const AVG = '__avg';

// 과목 표시 순서 — 국·수·영·한국사·탐구·그 외 (성장 탭과 같은 규칙)
const SUBJECT_ORDER = ['국어', '수학', '영어', '한국사'];
function subjectRank(subject: string) {
  const i = SUBJECT_ORDER.findIndex((s) => subject.startsWith(s));
  return i === -1 ? SUBJECT_ORDER.length : i;
}

/** 성적 추이 — 모의고사/내신 트랙 · 평균/과목 칩 · 한 줄 꺾은선 (웹의 종류별·과목별 보기를 칩으로) */
function ExamTrend({ exams }: { exams: ParentReportExamPoint[] }) {
  const [track, setTrack] = useState<Track>('mock');
  const [subject, setSubject] = useState(AVG);

  const tracks: Record<Track, ParentReportExamPoint[]> = {
    mock: exams.filter((e) => e.type !== 'SCHOOL_EXAM'),
    school: exams.filter((e) => e.type === 'SCHOOL_EXAM'),
  };
  const available = (['mock', 'school'] as const).filter((t) => tracks[t].length >= 2);
  if (available.length === 0) return null;

  const active: Track = available.includes(track) ? track : available[0];
  const list = tracks[active];
  const seen = new Map<string, number>();
  for (const e of list) for (const sub of Object.keys(e.grades)) seen.set(sub, (seen.get(sub) ?? 0) + 1);
  const subjects = [...seen.entries()]
    .filter(([, n]) => n >= 2)
    .map(([sub]) => sub)
    .sort((a, b) => subjectRank(a) - subjectRank(b) || a.localeCompare(b, 'ko'));
  const sel = subject === AVG || subjects.includes(subject) ? subject : AVG;

  const points = list.flatMap((e) => {
    const v = sel === AVG ? e.averageGrade : e.grades[sel];
    return v == null ? [] : [{ key: e.key, label: shortDayKey(e.date), value: v, caption: e.name }];
  });
  const label = active === 'mock' ? '모의고사' : '내신';

  return (
    <View style={{ marginTop: space.x6, gap: space.x3 }}>
      <SubHeading hint={sel === AVG ? '국어·수학·영어·탐구 평균 등급이에요' : `${sel} 등급이에요`}>
        {`${label} 성적 추이`}
      </SubHeading>
      {available.length > 1 && (
        <Segmented
          options={[
            { value: 'mock', label: '모의고사' },
            { value: 'school', label: '내신' },
          ]}
          value={active}
          onChange={(t) => {
            setTrack(t);
            setSubject(AVG);
          }}
        />
      )}
      {subjects.length > 0 && (
        <ChipGroup>
          <Chip size="sm" selected={sel === AVG} onPress={() => setSubject(AVG)}>
            평균
          </Chip>
          {subjects.map((sub) => (
            <Chip key={sub} size="sm" selected={sel === sub} onPress={() => setSubject(sub)}>
              {sub}
            </Chip>
          ))}
        </ChipGroup>
      )}
      {points.length >= 2 ? (
        <GrowthLineChart
          points={points}
          invert
          {...gradeDomain(points.map((p) => p.value))}
          formatValue={grade}
          accessibilityLabel={`${label} ${sel === AVG ? '평균' : sel} 등급 추이 그래프, 최근 ${grade(points[points.length - 1].value)}`}
        />
      ) : (
        <Text variant="t4-regular" color="neutralSubtle">
          시험이 두 번 이상 쌓이면 추이를 그래프로 보여 드려요.
        </Text>
      )}
    </View>
  );
}

/** 과목 한 줄 — 과목명 · 처음 → 최근 등급 · 시험 이름, 오른쪽에 변화 배지 */
function SubjectRow({
  subject: s,
  last,
}: {
  subject: NonNullable<ParentMentoringReport['scores']>['subjects'][number];
  last: boolean;
}) {
  const first = s.firstGrade ? `${s.firstGrade}등급` : '-';
  const latest = s.latestGrade ? `${s.latestGrade}등급` : '-';
  const names = s.firstExamName || s.latestExamName;
  return (
    <View
      accessible
      accessibilityLabel={`${s.subject}, 처음 ${first}, 최근 ${latest}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x3,
        paddingTop: space.x3_5,
        paddingBottom: last ? 0 : space.x3_5,
      }}>
      <View style={{ flex: 1, minWidth: 0, gap: space.x0_5 }}>
        <Text variant="t5-bold">{s.subject}</Text>
        <Text variant="t4-regular" color="neutralMuted" tabular>
          {`처음 ${first}`}
          <Text variant="t4-regular" color="placeholder">
            {'  →  '}
          </Text>
          {'최근 '}
          <Text variant="t4-bold">{latest}</Text>
        </Text>
        {names ? (
          <Text variant="t3-regular" color="neutralSubtle">
            {`${s.firstExamName ?? '-'} → ${s.latestExamName ?? '-'}`}
          </Text>
        ) : null}
      </View>
      <ChangeBadge improvement={s.improvement} />
    </View>
  );
}

/** 등급 변화 배지 — 양수 = 등급 상승(좋아짐) */
function ChangeBadge({ improvement }: { improvement: number | null }) {
  if (improvement == null) {
    return (
      <Text variant="t4-regular" color="neutralSubtle">
        -
      </Text>
    );
  }
  if (improvement > 0) return <Badge tone="ok">{`▲ ${improvement}`}</Badge>;
  if (improvement < 0) return <Badge tone="bad">{`▼ ${Math.abs(improvement)}`}</Badge>;
  return <Badge tone="gray">변동 없음</Badge>;
}
