import { useRouter } from 'expo-router';
import { Check, ClipboardList, Lock } from 'lucide-react-native';
import { useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  color,
  Columns,
  confirm,
  EmptyState,
  ErrorState,
  IconTile,
  ListRow,
  ProgressBar,
  Screen,
  Section,
  Skeleton,
  space,
  Stack,
  TABLET_CONTENT_WIDTH,
  TABLET_WIDE,
  Text,
  toast,
  useResponsive,
} from '@/design';
import { submitStudentSurvey, surveyStepHref, useStudentSurvey } from '@/lib/api/student-survey';
import { refreshBadges } from '@/lib/badges';

/**
 * 초기 설문 — 웹 포털 /s/[token]/survey 와 같은 구성 (상태 헤딩 · 진행률 · 전체 질문 · 하단 CTA).
 * 태블릿(≥700): 왼쪽 상태 헤딩 + 진행률 카드(안에 CTA), 오른쪽 전체 질문.
 */

function formatSubmittedDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' });
}

export default function StudentSurveyScreen() {
  const router = useRouter();
  const { isTablet } = useResponsive();
  const { data, error, isLoading, isRefreshing, refresh, retry } = useStudentSurvey();
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);

  const sections = data?.sections ?? [];
  const total = sections.length;
  const filled = sections.filter((s) => s.complete).length;
  const allFilled = total > 0 && filled === total;
  const submitted = !!data?.submittedAt;
  const firstIncomplete = sections.findIndex((s) => !s.complete);
  const resume = sections[firstIncomplete === -1 ? 0 : firstIncomplete];
  const ctaLabel = filled === 0 ? '설문 시작하기' : `이어서 작성 (${firstIncomplete + 1}/${total})`;

  async function submit() {
    if (busy.current) return;
    const ok = await confirm({
      title: '설문을 제출할까요?',
      message: '제출 후에는 수정이 제한돼요.',
      confirmText: '제출하기',
    });
    if (!ok) return;
    busy.current = true;
    setSubmitting(true);
    try {
      await submitStudentSurvey();
      toast('설문을 제출했어요', 'success');
      refreshBadges();
    } catch (e) {
      toast(e instanceof Error ? e.message : '제출하지 못했어요. 잠시 뒤 다시 시도해 주세요.', 'error');
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }

  // 폰은 하단 고정 CTA, 태블릿은 왼쪽 진행률 카드 안에 (넓은 화면에서 버튼이 끝까지 늘어나지 않게)
  const cta =
    data && total > 0 && !submitted ? (
      <View style={{ gap: space.x2_5 }}>
        <Text variant="t3-regular" color="neutralSubtle" align="center">
          {allFilled
            ? '모든 질문에 답했어요 · 제출 후에는 수정이 제한돼요'
            : `${total - filled}개 남았어요 · 모두 답하면 제출할 수 있어요`}
        </Text>
        {allFilled ? (
          <Button variant="primary" size="xl" block loading={submitting} onPress={() => void submit()}>
            설문 제출하기
          </Button>
        ) : (
          <Button
            variant="primary"
            size="xl"
            block
            onPress={() => resume && router.push(surveyStepHref(resume.key))}>
            {ctaLabel}
          </Button>
        )}
      </View>
    ) : undefined;

  let body;
  if (!data && isLoading) {
    body = <OverviewSkeleton isTablet={isTablet} />;
  } else if (!data) {
    body = (
      <Centered isTablet={isTablet}>
        <ErrorState message={error ?? undefined} onRetry={() => void retry()} />
      </Centered>
    );
  } else if (total === 0) {
    body = (
      <Centered isTablet={isTablet}>
        <EmptyState
          icon={ClipboardList}
          title="아직 준비된 설문이 없어요"
          description="설문이 열리면 여기에서 답할 수 있어요."
        />
      </Centered>
    );
  } else {
    /* 상태 헤딩 */
    const heading = (
      <View key="heading" style={[s.heading, isTablet && { paddingTop: space.x2 }]}>
        {submitted ? (
          <>
            <IconTile icon={Check} tone="ok" solid size={56} round />
            <Text variant="t9-bold" style={{ marginTop: space.x5 }} accessibilityRole="header">
              제출 완료
            </Text>
            <Text variant="t5-regular" color="neutralMuted" style={{ marginTop: space.x2 }}>
              컨설턴트가 확인한 뒤 곧 연락드릴게요.
            </Text>
            <View style={s.lockNote}>
              <Lock color={color.fg.neutralSubtle} size={14} strokeWidth={2.4} />
              <Text variant="t4-regular" color="neutralSubtle" style={{ flexShrink: 1 }}>
                {`${data.submittedAt ? `${formatSubmittedDate(data.submittedAt)} 제출 · ` : ''}제출 후 잠김 · 답변은 계속 볼 수 있어요`}
              </Text>
            </View>
          </>
        ) : (
          <>
            <Text variant="t9-bold" accessibilityRole="header">
              {`${total}개 질문에 답해 주세요`}
            </Text>
            <Text variant="t5-regular" color="neutralMuted" style={{ marginTop: space.x2 }}>
              컨설턴트가 본인 상황을 깊이 이해하기 위한 질문이에요. 한 번에 다 쓰지 않아도 자동으로 저장돼요.
            </Text>
          </>
        )}
      </View>
    );

    /* 진행률 */
    const progress = !submitted ? (
      <Section key="progress">
        <View style={s.progressHead}>
          <Text variant="t5-medium" color="neutralMuted">
            작성한 질문
          </Text>
          <Text variant="t5-bold" tabular accessibilityLabel={`${total}개 중 ${filled}개 작성`}>
            <Text variant="t5-bold" color={allFilled ? 'positive' : 'brand'} tabular>
              {filled}
            </Text>
            <Text variant="t5-bold" color="placeholder" tabular>
              {` / ${total}`}
            </Text>
          </Text>
        </View>
        <ProgressBar value={total ? filled / total : 0} tone={allFilled ? 'ok' : 'brand'} style={{ marginTop: space.x3 }} />
        {isTablet && cta && <View style={{ marginTop: space.x5 }}>{cta}</View>}
      </Section>
    ) : null;

    /* 전체 질문 */
    const list = (
      <Section key="list" title="전체 질문" flush>
        {sections.map((sec, i) => (
          <ListRow
            key={sec.key}
            href={surveyStepHref(sec.key)}
            leading={<StepMark index={i} done={sec.complete} />}
            title={sec.title}
            description={
              <Text variant="t4-regular" color={sec.complete ? 'positive' : 'neutralSubtle'}>
                {sec.complete ? '작성 완료' : '미작성'}
              </Text>
            }
          />
        ))}
      </Section>
    );

    body = isTablet ? (
      <Columns leftFlex={1} left={[heading, progress]} right={list} />
    ) : (
      <Stack>
        {heading}
        {progress}
        {list}
      </Stack>
    );
  }

  return (
    <Screen
      kind="push"
      title="초기 설문"
      backFallback="/(student)"
      maxWidth={isTablet ? TABLET_WIDE : undefined}
      refreshing={isRefreshing}
      onRefresh={data ? () => void refresh() : undefined}
      footer={isTablet ? undefined : cta}>
      {body}
    </Screen>
  );
}

/** 태블릿 넓은 화면에서 한 단짜리 상태(빈 목록·오류)는 기본 폭으로 가운데 */
function Centered({ isTablet, children }: { isTablet: boolean; children: ReactNode }) {
  if (!isTablet) return <>{children}</>;
  return <View style={s.centered}>{children}</View>;
}

/** 질문 번호 동그라미 — 작성하면 초록 체크 */
function StepMark({ index, done }: { index: number; done: boolean }) {
  return (
    <View
      style={[s.mark, { backgroundColor: done ? color.bg.positiveSolid : color.bg.neutralWeak }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {done ? (
        <Check color={color.palette.staticWhite} size={16} strokeWidth={3} />
      ) : (
        <Text variant="t4-bold" color="neutralSubtle" tabular>
          {index + 1}
        </Text>
      )}
    </View>
  );
}

function OverviewSkeleton({ isTablet }: { isTablet: boolean }) {
  const heading = (
    <View key="heading" style={[s.heading, { gap: space.x2 }, isTablet && { paddingTop: space.x2 }]}>
      <Skeleton style={{ height: 32, width: '70%', borderRadius: 8 }} />
      <Skeleton style={{ height: 20, width: '95%' }} />
      <Skeleton style={{ height: 20, width: '60%' }} />
    </View>
  );
  const progress = (
    <Section key="progress">
      <View style={s.progressHead}>
        <Skeleton style={{ height: 20, width: 88 }} />
        <Skeleton style={{ height: 20, width: 44 }} />
      </View>
      <Skeleton style={{ height: 8, marginTop: space.x3, borderRadius: 4 }} />
    </Section>
  );
  const list = (
    <Section key="list" title="전체 질문" flush>
      {Array.from({ length: 5 }, (_, i) => (
        <View key={i} style={s.skeletonRow}>
          <Skeleton style={{ width: 32, height: 32, borderRadius: 16 }} />
          <View style={{ flex: 1, gap: space.x1_5 }}>
            <Skeleton style={{ height: 18, width: '55%' }} />
            <Skeleton style={{ height: 14, width: '25%' }} />
          </View>
        </View>
      ))}
    </Section>
  );
  if (isTablet) return <Columns leftFlex={1} left={[heading, progress]} right={list} />;
  return (
    <Stack>
      {heading}
      {progress}
      {list}
    </Stack>
  );
}

const s = StyleSheet.create({
  centered: { width: '100%', maxWidth: TABLET_CONTENT_WIDTH, alignSelf: 'center' },
  heading: { paddingHorizontal: space.x1, paddingTop: space.x4, paddingBottom: space.x3 },
  lockNote: { flexDirection: 'row', alignItems: 'center', gap: space.x1_5, marginTop: space.x4 },
  progressHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.x3 },
  mark: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    marginHorizontal: space.x2,
    paddingHorizontal: space.x3,
    paddingVertical: space.x3,
  },
});
