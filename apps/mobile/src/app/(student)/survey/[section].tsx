import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { CircleAlert, CircleCheck, ClipboardList } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SaveIndicator, SurveySectionEditor } from '@/components/survey-ui';
import {
  Button,
  confirm,
  EmptyState,
  ErrorState,
  Notice,
  ProgressBar,
  Screen,
  Skeleton,
  space,
  Text,
  toast,
} from '@/design';
import {
  peekSurvey,
  submitStudentSurvey,
  SURVEY_OVERVIEW_HREF,
  surveyStepHref,
  useStudentSurvey,
  useSurveyDraft,
  type SurveyResponse,
  type SurveySectionPayload,
} from '@/lib/api/student-survey';
import { refreshBadges } from '@/lib/badges';
import * as S from '@/lib/survey-schema';

/**
 * 초기 설문 한 질문 — 웹 포털 /s/[token]/survey/[step] (SurveyWizardStep) 과 같은 구성.
 * 위 진행 막대 + n / N + 자동저장 표시 · 질문 제목·설명 · 종류별 입력 · 하단 [이전][다음/제출하기].
 * 경로 파라미터는 섹션 key(history, goals …). 웹처럼 1부터 시작하는 번호도 받는다.
 */

const TITLE = '초기 설문';
const OVERVIEW_FALLBACK = '/(student)/survey';

function resolveIndex(sections: SurveySectionPayload[], param: string | undefined) {
  if (!param) return -1;
  const byKey = sections.findIndex((s) => s.key === param);
  if (byKey !== -1) return byKey;
  const n = Number(param);
  return Number.isInteger(n) && n >= 1 && n <= sections.length ? n - 1 : -1;
}

export default function SurveyStepScreen() {
  const router = useRouter();
  const { section: param } = useLocalSearchParams<{ section: string }>();
  const { data, error, isLoading, retry } = useStudentSurvey();

  if (!data) {
    return (
      <Screen kind="push" title={TITLE} surface="panel" backFallback={OVERVIEW_FALLBACK}>
        {isLoading ? <StepSkeleton /> : <ErrorState message={error ?? undefined} onRetry={() => void retry()} />}
      </Screen>
    );
  }

  const index = resolveIndex(data.sections, param);
  if (index === -1) {
    return (
      <Screen kind="push" title={TITLE} surface="panel" backFallback={OVERVIEW_FALLBACK}>
        <EmptyState
          icon={ClipboardList}
          title="질문을 찾을 수 없어요"
          description="전체 질문 목록에서 다시 골라 주세요."
          action={
            <Button variant="gray" size="md" onPress={() => router.replace(SURVEY_OVERVIEW_HREF)}>
              전체 질문 보기
            </Button>
          }
        />
      </Screen>
    );
  }

  return <StepView key={data.sections[index].key} data={data} index={index} />;
}

function StepView({ data, index }: { data: SurveyResponse; index: number }) {
  const router = useRouter();
  const navigation = useNavigation();
  const section = data.sections[index];
  const kind = section.kind as S.SurveyKind;
  const total = data.sections.length;
  const isLast = index === total - 1;
  const locked = !!data.submittedAt;

  const serverValue = useMemo(() => S.normalizeSectionValue(kind, section.value), [kind, section.value]);
  const draft = useSurveyDraft<S.SurveyAnswer>(section.key, serverValue, locked);
  const { syncFromServer } = draft;
  // 캐시로 먼저 그린 뒤 새 값이 오면(아직 손대지 않았을 때만) 교체
  useEffect(() => {
    syncFromServer(serverValue);
  }, [serverValue, syncFromServer]);

  const issues = useMemo(
    () => S.sectionIssues(kind, draft.value, data.gradeNumber),
    [kind, draft.value, data.gradeNumber],
  );
  const blank = useMemo(() => S.isBlankAnswer(kind, draft.value), [kind, draft.value]);

  const [nav, setNav] = useState<'prev' | 'next' | null>(null);
  const busy = useRef(false);

  /** 이동 전 저장 — 실패하면 머문다 */
  async function saveBeforeLeaving(dir: 'prev' | 'next') {
    setNav(dir);
    const ok = await draft.flush();
    setNav(null);
    if (!ok) toast('저장하지 못했어요. 네트워크를 확인하고 다시 눌러 주세요.', 'error');
    return ok;
  }

  async function run(fn: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    try {
      await fn();
    } finally {
      busy.current = false;
    }
  }

  // 이전: 스택 바로 아래가 이전 질문(또는 목록)이면 뒤로, 아니면 그 화면으로 교체
  const goPrev = () =>
    run(async () => {
      if (!(await saveBeforeLeaving('prev'))) return;
      const st = navigation.getState();
      const below = st && st.index > 0 ? st.routes[st.index - 1] : undefined;
      if (index === 0) {
        if (below?.name === 'survey/index') router.back();
        else router.replace(SURVEY_OVERVIEW_HREF);
        return;
      }
      const target = data.sections[index - 1];
      const belowParam = (below?.params as { section?: string } | undefined)?.section;
      if (below?.name === 'survey/[section]' && (belowParam === target.key || belowParam === String(index))) {
        router.back();
      } else {
        router.replace(surveyStepHref(target.key));
      }
    });

  const goNext = () =>
    run(async () => {
      if (!(await saveBeforeLeaving('next'))) return;
      router.push(surveyStepHref(data.sections[index + 1].key));
    });

  // 마지막 질문: 저장 → 전부 답했는지 확인 → 제출 확인 → 제출
  const finish = () =>
    run(async () => {
      if (locked) {
        router.dismissTo(SURVEY_OVERVIEW_HREF);
        return;
      }
      if (!(await saveBeforeLeaving('next'))) return;
      const latest = peekSurvey() ?? data;
      if (!latest.complete) {
        const remaining = latest.sections.filter((s) => !s.complete).map((s) => `‘${s.title}’`);
        const go = await confirm({
          title: '아직 답하지 않은 질문이 있어요',
          message: remaining.length
            ? `${remaining.join(', ')}에 모두 답해야 제출할 수 있어요.`
            : '답변을 한 번 더 확인해 주세요.',
          confirmText: '질문 목록 보기',
          cancelText: '닫기',
        });
        if (go) router.dismissTo(SURVEY_OVERVIEW_HREF);
        return;
      }
      const yes = await confirm({
        title: '설문을 제출할까요?',
        message: '제출 후에는 수정이 제한돼요.',
        confirmText: '제출하기',
      });
      if (!yes) return;
      setNav('next');
      try {
        await submitStudentSurvey();
        toast('설문을 제출했어요', 'success');
        refreshBadges();
        router.dismissTo(SURVEY_OVERVIEW_HREF);
      } catch (e) {
        toast(e instanceof Error ? e.message : '제출하지 못했어요. 잠시 뒤 다시 시도해 주세요.', 'error');
      } finally {
        setNav(null);
      }
    });

  const footer = (
    <View style={s.footer}>
      <View style={s.prevCol}>
        <Button
          variant="gray"
          size="xl"
          block
          loading={nav === 'prev'}
          disabled={nav === 'next'}
          onPress={() => void goPrev()}>
          이전
        </Button>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Button
          variant="primary"
          size="xl"
          block
          loading={nav === 'next'}
          disabled={nav === 'prev'}
          onPress={() => void (isLast ? finish() : goNext())}>
          {isLast ? (locked ? '전체 질문 보기' : '제출하기') : '다음'}
        </Button>
      </View>
    </View>
  );

  const showGuide = kind !== 'text' && !locked && (issues.length === 0 || !blank);

  return (
    <Screen kind="push" title={TITLE} surface="panel" backFallback={OVERVIEW_FALLBACK} footer={footer}>
      {/* 진행 */}
      <View style={{ paddingTop: space.x2 }}>
        <ProgressBar value={total ? (index + 1) / total : 0} style={{ height: space.x1 }} />
        <View style={s.progressRow}>
          <Text variant="t3-bold" tabular accessibilityLabel={`${total}개 중 ${index + 1}번째 질문`}>
            <Text variant="t3-bold" color="brand" tabular>
              {index + 1}
            </Text>
            <Text variant="t3-bold" color="placeholder" tabular>
              {` / ${total}`}
            </Text>
          </Text>
          <SaveIndicator status={draft.status} locked={locked} />
        </View>
      </View>

      {/* 질문 */}
      <View style={{ marginTop: space.x6 }}>
        <Text variant="t9-bold" accessibilityRole="header">
          {section.title}
        </Text>
        <Text variant="t5-regular" color="neutralMuted" style={{ marginTop: space.x2 }}>
          {section.description}
        </Text>
      </View>

      {/* 답 */}
      <View style={{ marginTop: space.x7 }}>
        <SurveySectionEditor
          kind={kind}
          value={draft.value}
          update={draft.update}
          locked={locked}
          gradeNumber={data.gradeNumber}
          title={section.title}
          placeholder={section.placeholder}
        />
      </View>

      {/* 남은 항목 안내 — 조금이라도 적었을 때만 */}
      {showGuide &&
        (issues.length === 0 ? (
          <Notice tone="ok" icon={CircleCheck} title="모두 작성했어요" style={s.guide}>
            {isLast ? '제출하기를 눌러 마무리해 주세요.' : '다음 질문으로 넘어가 주세요.'}
          </Notice>
        ) : (
          <Notice tone="warn" icon={CircleAlert} title={`남은 항목 ${issues.length}개`} style={s.guide}>
            {issues.slice(0, 6).join(', ')}
            {issues.length > 6 ? ` 외 ${issues.length - 6}개` : ''}
          </Notice>
        ))}
    </Screen>
  );
}

function StepSkeleton() {
  return (
    <View style={{ paddingTop: space.x2 }}>
      <Skeleton style={{ height: space.x1, borderRadius: 2 }} />
      <Skeleton style={{ height: 16, width: 44, marginTop: space.x2_5 }} />
      <Skeleton style={{ height: 30, width: '60%', marginTop: space.x6, borderRadius: 8 }} />
      <Skeleton style={{ height: 20, width: '95%', marginTop: space.x2 }} />
      <Skeleton style={{ height: 20, width: '70%', marginTop: space.x1_5 }} />
      <View style={{ marginTop: space.x7, gap: space.x5 }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ gap: space.x2 }}>
            <Skeleton style={{ height: 20, width: 96 }} />
            <Skeleton style={{ height: 52, borderRadius: 12 }} />
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: space.x5,
    marginTop: space.x2_5,
  },
  guide: { marginTop: space.x10 },
  footer: { flexDirection: 'row', gap: space.x2 },
  prevCol: { width: '30%', flexShrink: 0 },
});
