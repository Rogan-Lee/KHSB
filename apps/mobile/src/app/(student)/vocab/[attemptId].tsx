import { router, Stack as RouterStack, useLocalSearchParams } from 'expo-router';
import { TimerOff } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import {
  Button,
  ErrorState,
  IconTile,
  Screen,
  Skeleton,
  space,
  Text,
  toast,
  useResponsive,
} from '@/design';
import { VOCAB_TABLET_WIDTH } from '@/features/student-vocab/format';
import { VocabIntro } from '@/features/student-vocab/vocab-intro';
import { VocabResult } from '@/features/student-vocab/vocab-result';
import { VocabRunner } from '@/features/student-vocab/vocab-runner';
import {
  finalizeStudentVocab,
  startStudentVocab,
  studentVocabPath,
  type StudentVocabAttempt,
  type VocabRunnerState,
} from '@/lib/api/student-learning';
import { refreshBadges } from '@/lib/badges';
import { useMobileQuery } from '@/lib/mobile-api';

const VOCAB_LIST = '/(student)/vocab';

/**
 * 영단어 시험 한 건 — 인트로 → 응시 → 결과 (웹 /v/[token], /v/[token]/result 와 같은 흐름).
 * 제출 완료면 바로 결과, 기한이 지났거나 취소됐으면 종료 안내.
 */
export default function StudentVocabAttemptScreen() {
  const { attemptId } = useLocalSearchParams<{ attemptId: string }>();
  const id = String(attemptId ?? '');
  const { isTablet } = useResponsive();
  // 안내·응시·결과와 같은 폭 (태블릿)
  const maxWidth = isTablet ? VOCAB_TABLET_WIDTH : undefined;
  const { data, error, isLoading, isRefreshing, refresh, retry } = useMobileQuery<StudentVocabAttempt>(
    studentVocabPath(id),
  );
  const [runner, setRunner] = useState<VocabRunnerState | null>(null);
  const [finished, setFinished] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const startingRef = useRef(false);

  const backToList = () => {
    if (router.canGoBack()) router.back();
    else router.replace(VOCAB_LIST);
  };

  async function start() {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    setStartError(null);
    try {
      const state = await startStudentVocab(id);
      if (state.status === 'submitted') {
        await refresh();
        return;
      }
      if (state.items.length === 0 || state.resumeFromOrder >= state.items.length) {
        // 문항이 없거나 모든 문항에 이미 답했으면(제출만 안 된 상태) 바로 제출 처리
        await finalizeStudentVocab(id);
        refreshBadges();
        setFinished(true);
        await refresh();
        return;
      }
      setRunner(state);
    } catch (e) {
      const message = e instanceof Error ? e.message : '시험을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.';
      setStartError(message);
      toast(message, 'error');
      // 기한이 지났으면 새로 불러온 상태(EXPIRED)로 종료 안내가 뜬다
      void refresh();
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }

  let content;
  if (runner) {
    content = (
      <VocabRunner
        attemptId={id}
        items={runner.items}
        startIndex={runner.resumeFromOrder}
        perQuestionSeconds={runner.perQuestionSeconds}
        onFinished={async () => {
          setFinished(true);
          setRunner(null);
          await refresh();
        }}
        onEnded={() => {
          setRunner(null);
          void refresh();
        }}
      />
    );
  } else if (!data) {
    content = (
      <Screen kind="push" surface="panel" gutter={space.x5} maxWidth={maxWidth} backFallback={VOCAB_LIST}>
        {isLoading || !error ? <IntroSkeleton /> : <ErrorState message={error} onRetry={() => void retry()} />}
      </Screen>
    );
  } else if (data.status === 'SUBMITTED') {
    content = <VocabResult attempt={data} onDone={backToList} />;
  } else if (finished) {
    // 제출 직후 결과를 불러오는 중
    content = (
      <Screen
        kind="modal"
        title="시험 결과"
        surface="panel"
        gutter={space.x5}
        maxWidth={maxWidth}
        backFallback={VOCAB_LIST}>
        {error && !isRefreshing ? (
          <ErrorState message={error} onRetry={() => void refresh()} />
        ) : (
          <ResultSkeleton />
        )}
      </Screen>
    );
  } else if (data.status === 'EXPIRED') {
    content = (
      <Screen
        kind="push"
        surface="panel"
        gutter={space.x5}
        maxWidth={maxWidth}
        backFallback={VOCAB_LIST}
        footer={
          <Button variant="gray" size="xl" block onPress={backToList}>
            목록으로
          </Button>
        }>
        <View style={{ alignItems: 'center', paddingTop: space.x16 }}>
          <IconTile icon={TimerOff} tone="gray" size={64} round />
          <Text variant="t9-bold" align="center" style={{ marginTop: space.x5 }}>
            이미 종료된 시험이에요
          </Text>
          <Text variant="t5-regular" color="neutralSubtle" align="center" style={{ marginTop: space.x2 }}>
            응시 기한이 지났거나 취소된 시험이에요.{'\n'}다시 봐야 한다면 담당 선생님께 알려 주세요.
          </Text>
        </View>
      </Screen>
    );
  } else {
    content = (
      <VocabIntro
        attempt={data}
        starting={starting}
        error={startError}
        onStart={() => void start()}
        refreshing={isRefreshing}
        onRefresh={() => void refresh()}
      />
    );
  }

  return (
    <>
      {/* 응시 중에는 밀어서 뒤로 가기를 막는다 (나가기는 확인 후) */}
      <RouterStack.Screen options={{ gestureEnabled: !runner }} />
      {content}
    </>
  );
}

function IntroSkeleton() {
  return (
    <View style={{ paddingTop: space.x3 }}>
      <Skeleton style={{ width: 56, height: 56, borderRadius: 28 }} />
      <Skeleton style={{ width: 80, height: 16, marginTop: space.x5 }} />
      <Skeleton style={{ width: '70%', height: 30, marginTop: space.x2 }} />
      <Skeleton style={{ height: 76, marginTop: space.x6, borderRadius: 16 }} />
      <Skeleton style={{ width: 160, height: 20, marginTop: space.x8 }} />
      <Skeleton style={{ width: '92%', height: 16, marginTop: space.x4 }} />
      <Skeleton style={{ width: '80%', height: 16, marginTop: space.x3 }} />
    </View>
  );
}

function ResultSkeleton() {
  return (
    <View style={{ alignItems: 'center', paddingTop: space.x6 }}>
      <Skeleton style={{ width: 64, height: 64, borderRadius: 32 }} />
      <Skeleton style={{ width: 180, height: 28, marginTop: space.x5 }} />
      <Skeleton style={{ width: 140, height: 16, marginTop: space.x2 }} />
      <Skeleton style={{ width: 120, height: 56, marginTop: space.x5 }} />
      <Skeleton style={{ alignSelf: 'stretch', height: 76, marginTop: space.x6, borderRadius: 16 }} />
    </View>
  );
}
