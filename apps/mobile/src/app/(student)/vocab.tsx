import {
  CheckCircle2,
  ChevronRight,
  Clock,
  PlayCircle,
  XCircle,
} from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import {
  Badge,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  LoadingState,
  PrimaryButton,
  SectionTitle,
  StatTile,
} from '@/components/mobile-ui';
import { colors, palette, radius, spacing, type } from '@/constants/theme';
import {
  mutateMobileApi,
  requestMobileApi,
  useMobileQuery,
} from '@/lib/mobile-api';
import type {
  VocabAttemptSummary,
  VocabFinalizeResult,
  VocabListResponse,
  VocabResultResponse,
  VocabRunnerItem,
  VocabRunnerState,
} from '@/lib/mobile-api';

const BASE = '/api/mobile/v1/student/vocab';

type Mode =
  | { view: 'list' }
  | { view: 'run'; runner: VocabRunnerState }
  | { view: 'result'; attemptId: string };

export default function StudentVocabScreen() {
  const [mode, setMode] = useState<Mode>({ view: 'list' });

  if (mode.view === 'run') {
    return (
      <VocabRunner
        runner={mode.runner}
        onDone={(attemptId) => setMode({ view: 'result', attemptId })}
        onExit={() => setMode({ view: 'list' })}
      />
    );
  }
  if (mode.view === 'result') {
    return (
      <VocabResult
        attemptId={mode.attemptId}
        onBack={() => setMode({ view: 'list' })}
      />
    );
  }
  return (
    <VocabList
      onStart={(runner) => setMode({ view: 'run', runner })}
      onResult={(attemptId) => setMode({ view: 'result', attemptId })}
    />
  );
}

// ─────────────────────────── 목록 ───────────────────────────

function VocabList({
  onResult,
  onStart,
}: {
  onResult: (attemptId: string) => void;
  onStart: (runner: VocabRunnerState) => void;
}) {
  const { data, error, isLoading, isRefreshing, refresh, retry } =
    useMobileQuery<VocabListResponse>(BASE);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [startError, setStartError] = useState('');

  const items = data?.items ?? [];
  const todo = items.filter((a) => a.status === 'ASSIGNED');
  const inProgress = items.filter((a) => a.status === 'IN_PROGRESS');
  const done = items.filter((a) => a.status === 'SUBMITTED');

  async function start(attempt: VocabAttemptSummary) {
    setBusyId(attempt.id);
    setStartError('');
    try {
      const runner = await mutateMobileApi<VocabRunnerState>(
        `${BASE}/${attempt.id}/start`,
        'POST',
        {},
      );
      if (runner.status === 'submitted') {
        onResult(attempt.id);
        return;
      }
      onStart(runner);
    } catch (caught) {
      setStartError(
        caught instanceof Error ? caught.message : '시험을 시작하지 못했습니다.',
      );
    } finally {
      setBusyId(null);
    }
  }

  const avg =
    done.length > 0
      ? Math.round(
          done.reduce((s, a) => s + (a.score ?? 0), 0) / done.length,
        )
      : null;

  return (
    <AppScreen
      eyebrow="DAILY VOCABULARY"
      onRefresh={() => void refresh()}
      refreshing={isRefreshing}
      title="단어 시험">
      {isLoading && !data ? <LoadingState /> : null}
      {error && !data ? <ErrorState message={error} onRetry={() => void retry()} /> : null}

      {data ? (
        <>
          <View style={styles.tiles}>
            <StatTile
              caption="응시할 시험"
              value={`${todo.length + inProgress.length}건`}
              valueColor={palette.blue50}
            />
            <StatTile
              caption="평균 점수"
              value={avg === null ? '—' : `${avg}점`}
              valueColor={palette.green50}
            />
          </View>

          {startError ? <Text style={styles.startError}>{startError}</Text> : null}

          {inProgress.length > 0 ? (
            <>
              <SectionTitle>이어서 풀기</SectionTitle>
              <View style={styles.list}>
                {inProgress.map((a) => (
                  <AttemptRow
                    key={a.id}
                    attempt={a}
                    busy={busyId === a.id}
                    cta="이어서 풀기"
                    onPress={() => void start(a)}
                    tone="warning"
                  />
                ))}
              </View>
            </>
          ) : null}

          {todo.length > 0 ? (
            <>
              <SectionTitle>응시할 시험</SectionTitle>
              <View style={styles.list}>
                {todo.map((a) => (
                  <AttemptRow
                    key={a.id}
                    attempt={a}
                    busy={busyId === a.id}
                    cta="시작하기"
                    onPress={() => void start(a)}
                    tone="blue"
                  />
                ))}
              </View>
            </>
          ) : null}

          {done.length > 0 ? (
            <>
              <SectionTitle>완료한 시험</SectionTitle>
              <Card padded={false}>
                {done.map((a, i) => (
                  <View key={a.id}>
                    {i > 0 ? <Divider /> : null}
                    <Pressable
                      onPress={() => onResult(a.id)}
                      style={({ pressed }) => [
                        styles.doneRow,
                        pressed && styles.pressed,
                      ]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.doneTitle} numberOfLines={1}>
                          {a.title}
                        </Text>
                        <Text style={styles.doneCaption}>
                          {a.correctCount}/{a.totalQuestions} 정답
                        </Text>
                      </View>
                      <Badge tone={(a.score ?? 0) >= 80 ? 'positive' : 'warning'}>
                        {a.score ?? 0}점
                      </Badge>
                      <ChevronRight color={colors.textAssistive} size={18} />
                    </Pressable>
                  </View>
                ))}
              </Card>
            </>
          ) : null}

          {items.length === 0 ? (
            <EmptyState
              title="배정된 단어 시험이 없어요"
              message="새 시험이 출제되면 여기에 표시됩니다."
            />
          ) : null}
        </>
      ) : null}
    </AppScreen>
  );
}

function AttemptRow({
  attempt,
  busy,
  cta,
  onPress,
  tone,
}: {
  attempt: VocabAttemptSummary;
  busy: boolean;
  cta: string;
  onPress: () => void;
  tone: 'blue' | 'warning';
}) {
  return (
    <Pressable
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}>
      <Card>
        <View style={styles.attemptTop}>
          <Text style={styles.attemptTitle} numberOfLines={1}>
            {attempt.title}
          </Text>
          {tone === 'warning' ? (
            <Clock color={colors.amber} size={16} />
          ) : (
            <PlayCircle color={palette.blue50} size={16} />
          )}
        </View>
        <Text style={styles.attemptMeta}>
          {attempt.questionCount}문항 ·{' '}
          {attempt.perQuestionSeconds > 0
            ? `${attempt.perQuestionSeconds}초/문항`
            : '시간 제한 없음'}
        </Text>
        <View style={{ marginTop: spacing.md }}>
          <PrimaryButton onPress={onPress} disabled={busy} size="md">
            {busy ? '여는 중…' : cta}
          </PrimaryButton>
        </View>
      </Card>
    </Pressable>
  );
}

// ─────────────────────────── 풀이 런너 ───────────────────────────

function VocabRunner({
  onDone,
  onExit,
  runner,
}: {
  onDone: (attemptId: string) => void;
  onExit: () => void;
  runner: VocabRunnerState;
}) {
  const items = runner.items;
  const [index, setIndex] = useState(
    Math.min(runner.resumeFromOrder, Math.max(items.length - 1, 0)),
  );
  const [answer, setAnswer] = useState('');
  const [remaining, setRemaining] = useState(runner.perQuestionSeconds);
  const [submitting, setSubmitting] = useState(false);
  const startedAt = useRef(Date.now());
  const inputRef = useRef<TextInput>(null);

  const current: VocabRunnerItem | undefined = items[index];
  const isLast = index >= items.length - 1;
  const timed = runner.perQuestionSeconds > 0;

  const advance = useCallback(
    async (value: string) => {
      if (!current || submitting) return;
      setSubmitting(true);
      const timeMs = Date.now() - startedAt.current;
      try {
        await mutateMobileApi(`${BASE}/${runner.attemptId}/answer`, 'POST', {
          itemId: current.id,
          answer: value,
          timeMs,
        });
      } catch {
        // 네트워크 실패해도 진행은 막지 않음(서버는 미응답을 오답 처리)
      }
      if (isLast) {
        try {
          await requestMobileApi<VocabFinalizeResult>(
            `${BASE}/${runner.attemptId}/finalize`,
            { method: 'POST' },
          );
        } catch {
          // 무시 — 결과 화면에서 상태 재조회
        }
        setSubmitting(false);
        onDone(runner.attemptId);
        return;
      }
      setIndex((i) => i + 1);
      setAnswer('');
      setRemaining(runner.perQuestionSeconds);
      startedAt.current = Date.now();
      setSubmitting(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [current, isLast, onDone, runner.attemptId, runner.perQuestionSeconds, submitting],
  );

  // 문항 제한시간 카운트다운 → 0 이 되면 현재 입력값으로 자동 제출
  useEffect(() => {
    if (!timed || submitting) return;
    if (remaining <= 0) {
      void advance(answer);
      return;
    }
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [advance, answer, remaining, submitting, timed]);

  if (!current) {
    return (
      <AppScreen title="단어 시험">
        <EmptyState title="문항이 없습니다" message="잠시 후 다시 시도하세요." />
        <PrimaryButton onPress={onExit}>목록으로</PrimaryButton>
      </AppScreen>
    );
  }

  const directionLabel =
    current.direction === 'EN_TO_KO' ? '뜻을 입력하세요' : '영단어를 입력하세요';

  return (
    <AppScreen
      eyebrow={runner.examTitle}
      title={`${index + 1} / ${items.length}`}
      right={
        timed ? (
          <View
            style={[styles.timer, remaining <= 3 && styles.timerUrgent]}>
            <Clock
              color={remaining <= 3 ? palette.red50 : palette.blue50}
              size={14}
            />
            <Text
              style={[
                styles.timerText,
                remaining <= 3 && { color: palette.red50 },
              ]}>
              {remaining}
            </Text>
          </View>
        ) : undefined
      }>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${((index + 1) / items.length) * 100}%` },
          ]}
        />
      </View>

      <Card>
        <Text style={styles.qLabel}>{directionLabel}</Text>
        <Text style={styles.qPrompt}>{current.prompt}</Text>
      </Card>

      <TextInput
        ref={inputRef}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        editable={!submitting}
        onChangeText={setAnswer}
        onSubmitEditing={() => void advance(answer)}
        placeholder="정답 입력"
        placeholderTextColor={colors.textAssistive}
        returnKeyType={isLast ? 'done' : 'next'}
        style={styles.answerInput}
        value={answer}
      />

      <PrimaryButton disabled={submitting} onPress={() => void advance(answer)}>
        {submitting ? '처리 중…' : isLast ? '제출하고 채점' : '다음 문항'}
      </PrimaryButton>
      {!isLast ? (
        <Pressable
          onPress={() => void advance('')}
          style={({ pressed }) => [styles.skip, pressed && styles.pressed]}>
          <Text style={styles.skipText}>모르겠어요 (건너뛰기)</Text>
        </Pressable>
      ) : null}
    </AppScreen>
  );
}

// ─────────────────────────── 결과 ───────────────────────────

function VocabResult({
  attemptId,
  onBack,
}: {
  attemptId: string;
  onBack: () => void;
}) {
  const { data, error, isLoading, retry } = useMobileQuery<VocabResultResponse>(
    `${BASE}/${attemptId}`,
  );

  return (
    <AppScreen eyebrow="시험 결과" title={data?.title ?? '단어 시험'}>
      {isLoading && !data ? <LoadingState /> : null}
      {error && !data ? <ErrorState message={error} onRetry={() => void retry()} /> : null}

      {data ? (
        <>
          <Card>
            <View style={styles.scoreRow}>
              <View>
                <Text style={styles.scoreCaption}>점수</Text>
                <Text
                  style={[
                    styles.scoreValue,
                    (data.score ?? 0) >= 80 && { color: palette.green50 },
                  ]}>
                  {data.score ?? 0}점
                </Text>
              </View>
              <Badge tone={(data.score ?? 0) >= 80 ? 'positive' : 'warning'}>
                {data.correctCount}/{data.totalQuestions} 정답
              </Badge>
            </View>
          </Card>

          <SectionTitle>문항별 결과</SectionTitle>
          <View style={styles.list}>
            {data.items.map((item) => (
              <Card key={item.id}>
                <View style={styles.resultTop}>
                  {item.isCorrect ? (
                    <CheckCircle2 color={palette.green50} size={18} />
                  ) : (
                    <XCircle color={palette.red50} size={18} />
                  )}
                  <Text style={styles.resultPrompt} numberOfLines={2}>
                    {item.prompt}
                  </Text>
                </View>
                <View style={styles.resultBody}>
                  <Text style={styles.resultLine}>
                    <Text style={styles.resultKey}>내 답: </Text>
                    <Text
                      style={
                        item.isCorrect ? styles.resultOk : styles.resultBad
                      }>
                      {item.studentAnswer || '(미응답)'}
                    </Text>
                  </Text>
                  {!item.isCorrect ? (
                    <Text style={styles.resultLine}>
                      <Text style={styles.resultKey}>정답: </Text>
                      <Text style={styles.resultOk}>{item.answer}</Text>
                    </Text>
                  ) : null}
                </View>
              </Card>
            ))}
          </View>

          <PrimaryButton onPress={onBack} variant="secondary">
            목록으로 돌아가기
          </PrimaryButton>
        </>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: spacing.md },
  list: { gap: spacing.md },
  startError: { ...type.caption1, color: palette.red50 },
  pressed: { opacity: 0.72 },

  attemptTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  attemptTitle: { ...type.label1, color: colors.textNormal, flex: 1 },
  attemptMeta: { ...type.caption1, color: colors.textAssistive, marginTop: 4 },

  doneRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  doneTitle: { ...type.label1, color: colors.textNormal },
  doneCaption: { ...type.caption1, color: colors.textAssistive, marginTop: 2 },

  // 런너
  timer: {
    alignItems: 'center',
    backgroundColor: palette.blue5,
    borderRadius: radius.full,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  timerUrgent: { backgroundColor: palette.red5 },
  timerText: {
    ...type.label2,
    color: palette.blue50,
    fontVariant: ['tabular-nums'],
    minWidth: 16,
    textAlign: 'center',
  },
  progressTrack: {
    backgroundColor: colors.fillAlt,
    borderRadius: radius.full,
    height: 6,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: palette.blue50,
    borderRadius: radius.full,
    height: 6,
  },
  qLabel: { ...type.caption1, color: colors.textAssistive },
  qPrompt: {
    ...type.heading1,
    color: colors.textNormal,
    marginTop: spacing.sm,
  },
  answerInput: {
    backgroundColor: colors.surface,
    borderColor: colors.lineStrong,
    borderRadius: radius.lg,
    borderWidth: 1,
    color: colors.textNormal,
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...type.body2,
  },
  skip: { alignItems: 'center', paddingVertical: spacing.sm },
  skipText: { ...type.caption1, color: colors.textAssistive },

  // 결과
  scoreRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scoreCaption: { ...type.caption1, color: colors.textAssistive },
  scoreValue: { ...type.title1, color: colors.textNormal, marginTop: 2 },
  resultTop: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  resultPrompt: { ...type.label1, color: colors.textNormal, flex: 1 },
  resultBody: { gap: 4, marginTop: spacing.sm, paddingLeft: 26 },
  resultLine: { ...type.caption1, color: colors.textAssistive },
  resultKey: { ...type.caption1, color: colors.textAssistive },
  resultOk: { color: palette.green50, fontWeight: '700' },
  resultBad: { color: palette.red50, fontWeight: '700' },
});
