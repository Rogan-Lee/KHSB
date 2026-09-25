import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Keyboard, ScrollView, StyleSheet, useWindowDimensions, View, type TextInput } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import {
  Badge,
  Button,
  color,
  confirm,
  ProgressBar,
  Screen,
  space,
  Text,
  TextField,
  toast,
  useResponsive,
} from '@/design';
import {
  finalizeStudentVocab,
  saveStudentVocabAnswer,
  type VocabRunnerItem,
} from '@/lib/api/student-learning';
import { refreshBadges } from '@/lib/badges';
import { MobileApiError } from '@/lib/mobile-api';

import { VOCAB_TABLET_WIDTH } from './format';

/** 서버가 "끝난 시험"이라고 답한 경우 — 재시도해도 소용없음 */
const TERMINAL = /만료|취소|찾을 수 없|시작되지 않은/;

/**
 * 응시 엔진 — 웹 /v/[token] VocabRunner 와 같은 흐름.
 *  · 문항마다 제한 시간(카운트다운 링). 시간이 지나면 지금 입력값으로 자동 제출
 *  · "모르겠어요" = 빈 답 제출 · "다음/제출하기" 는 입력창 바로 아래(키보드 위)
 *  · 입력창은 문항 사이에도 포커스를 유지(비활성화하지 않고 처리 중에는 입력만 무시)
 *  · 답은 문항마다 저장 → 중간에 나가도(확인 후) 목록에서 이어서 풀 수 있다
 *  · 저장·제출 실패는 토스트로 알리고 같은 문항에 머문다(다시 누르면 재시도)
 */
export function VocabRunner({
  attemptId,
  items,
  startIndex,
  perQuestionSeconds,
  onFinished,
  onEnded,
}: {
  attemptId: string;
  items: VocabRunnerItem[];
  startIndex: number;
  perQuestionSeconds: number;
  /** 제출(채점) 완료 → 결과 화면으로 */
  onFinished: () => Promise<void>;
  /** 서버에서 이미 끝난(만료·취소) 시험 */
  onEnded: () => void;
}) {
  const navigation = useNavigation();
  const { height } = useWindowDimensions();
  const compact = height < 720;
  const { isTablet } = useResponsive();
  // 헤더·진행 막대·본문이 같은 폭 (폰 480 = 웹 /v/[token], 태블릿은 시험 흐름 공통 폭)
  const width = isTablet ? VOCAB_TABLET_WIDTH : 480;

  const total = items.length;
  const timed = perQuestionSeconds > 0;
  const [index, setIndex] = useState(Math.min(startIndex, Math.max(total - 1, 0)));
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [paused, setPaused] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [remaining, setRemaining] = useState(perQuestionSeconds);

  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  const advancing = useRef(false);
  const qStart = useRef(0);
  const deadline = useRef(0);
  const pausedLeft = useRef<number | null>(null);

  // 첫 문항 시작 시각
  useEffect(() => {
    const now = Date.now();
    qStart.current = now;
    deadline.current = now + perQuestionSeconds * 1000;
  }, [perQuestionSeconds]);

  // 키보드가 올라오면 입력창 아래 버튼까지 보이도록 끝으로 스크롤
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => scrollRef.current?.scrollToEnd({ animated: true }));
    return () => sub.remove();
  }, []);

  const current = items[index];
  const isLast = index + 1 >= total;

  function fail(e: unknown, fallback: string) {
    if (e instanceof MobileApiError && TERMINAL.test(e.message)) {
      toast(e.message, 'error');
      setLeaving(true);
      onEnded();
      return;
    }
    toast(e instanceof MobileApiError ? e.message : fallback, 'error');
  }

  async function goNext(answer: string) {
    if (advancing.current || !current) return;
    advancing.current = true;
    setBusy(true);
    const elapsed = Date.now() - qStart.current;

    try {
      await saveStudentVocabAnswer(attemptId, { itemId: current.id, answer, timeMs: elapsed });
    } catch (e) {
      advancing.current = false;
      setBusy(false);
      setStalled(true);
      fail(e, '답을 저장하지 못했어요. 연결을 확인하고 다시 눌러 주세요.');
      return;
    }

    if (isLast) {
      try {
        await finalizeStudentVocab(attemptId);
      } catch (e) {
        advancing.current = false;
        setBusy(false);
        setStalled(true);
        fail(e, '제출하지 못했어요. 연결을 확인하고 다시 눌러 주세요.');
        return;
      }
      refreshBadges();
      setLeaving(true);
      await onFinished();
      return;
    }

    const now = Date.now();
    qStart.current = now;
    deadline.current = now + perQuestionSeconds * 1000;
    setRemaining(perQuestionSeconds);
    setIndex(index + 1);
    setValue('');
    setStalled(false);
    setBusy(false);
    advancing.current = false;
    inputRef.current?.focus();
  }

  // 시간 초과 → 지금 입력값으로 제출 (최신 입력값을 읽도록 effect event)
  const onTimeout = useEffectEvent(() => {
    void goNext(value);
  });

  useEffect(() => {
    if (!timed || paused || busy || stalled) return;
    const id = setInterval(() => {
      const left = (deadline.current - Date.now()) / 1000;
      if (left <= 0) {
        clearInterval(id);
        setRemaining(0);
        onTimeout();
      } else {
        setRemaining(left);
      }
    }, 100);
    return () => clearInterval(id);
  }, [index, timed, paused, busy, stalled]);

  function pause() {
    if (pausedLeft.current != null) return;
    pausedLeft.current = Math.max(0, deadline.current - Date.now());
    setPaused(true);
  }
  function resume() {
    if (pausedLeft.current != null) {
      deadline.current = Date.now() + pausedLeft.current;
      pausedLeft.current = null;
    }
    setPaused(false);
    inputRef.current?.focus();
  }

  // 뒤로 가기(버튼·제스처·안드로이드 백) → 확인 후 나가기. 답은 문항마다 저장돼 있어 이어서 풀 수 있다.
  usePreventRemove(!leaving, ({ data }) => {
    pause();
    void confirm({
      title: '시험을 잠시 멈출까요?',
      message: '지금까지 푼 답은 저장돼요. 목록에서 이 문항부터 이어서 풀 수 있어요.',
      confirmText: '나가기',
      cancelText: '계속 풀기',
    }).then((ok) => {
      if (ok) {
        setLeaving(true);
        navigation.dispatch(data.action);
      } else {
        resume();
      }
    });
  });

  if (!current) return null;

  const onSubmit = () => {
    if (busy) return;
    void goNext(value);
  };
  // 모르겠어요 — 빈 답으로 제출(시간 초과와 같은 처리)
  const skip = () => {
    if (busy) return;
    void goNext('');
  };

  const pct = timed ? Math.max(0, Math.min(1, remaining / perQuestionSeconds)) : 1;
  const danger = timed && remaining <= 3;
  const enToKo = current.direction === 'EN_TO_KO';
  const longPrompt = current.prompt.length > 14;

  return (
    <Screen
      kind="modal"
      title={`${index + 1} / ${total}`}
      surface="panel"
      scroll={false}
      maxWidth={width}
      backFallback="/(student)/vocab">
      <View style={[s.progress, { maxWidth: width }]} accessible accessibilityLabel={`전체 ${total}문항 중 ${index + 1}번째`}>
        <ProgressBar value={index / total} />
      </View>
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.body, { maxWidth: width, paddingTop: compact ? space.x5 : space.x8 }]}>
        {/* 문제 — 입력창은 이 블록 밖에 둬서 문항이 바뀌어도 다시 그려지지(=키보드 닫힘) 않게 한다 */}
        <View key={index} style={s.question}>
          {timed && (
            <CountdownRing pct={pct} danger={danger} seconds={Math.ceil(remaining)} size={compact ? 60 : 72} />
          )}
          <View style={[s.directionRow, timed && { marginTop: compact ? space.x3 : space.x5 }]}>
            <Badge tone={enToKo ? 'brand' : 'info'} style={{ alignSelf: 'center' }}>
              {enToKo ? '영→한' : '한→영'}
            </Badge>
            <Text variant="t5-medium" color="neutralSubtle">
              {enToKo ? '이 단어의 뜻은?' : '이 뜻의 영단어는?'}
            </Text>
          </View>
          <Text
            variant={longPrompt ? (compact ? 't8-bold' : 't9-bold') : compact ? 't10-bold' : 't12-bold'}
            align="center"
            style={{ marginTop: space.x3, alignSelf: 'stretch' }}>
            {current.prompt}
          </Text>
        </View>

        <View style={{ marginTop: compact ? space.x5 : space.x8 }}>
          <TextField
            ref={inputRef}
            size="lg"
            value={value}
            onChangeText={(t) => {
              // 처리 중에는 입력만 무시 — 비활성화하면 포커스를 잃어 키보드가 닫힌다
              if (!advancing.current) setValue(t);
            }}
            onSubmitEditing={onSubmit}
            submitBehavior="submit"
            returnKeyType={isLast ? 'done' : 'next'}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            importantForAutofill="no"
            accessibilityLabel={enToKo ? '뜻 입력' : '영단어 입력'}
            placeholder={enToKo ? '뜻을 입력해 주세요' : '영단어를 입력해 주세요'}
          />
        </View>

        {/* 입력창 바로 아래 — 키보드 위로 항상 보이게 */}
        <View style={s.actions}>
          <Button variant="gray" size="xl" onPress={skip} disabled={busy}>
            모르겠어요
          </Button>
          <View style={{ flex: 1 }}>
            <Button variant="primary" size="xl" block loading={busy} onPress={onSubmit}>
              {isLast ? '제출하기' : '다음'}
            </Button>
          </View>
        </View>
        {stalled && (
          <Text variant="t3-regular" color="neutralSubtle" align="center" style={{ marginTop: space.x3 }}>
            저장되지 않았어요. 버튼을 다시 눌러 주세요.
          </Text>
        )}
      </ScrollView>
    </Screen>
  );
}

function CountdownRing({
  pct,
  danger,
  seconds,
  size,
}: {
  pct: number;
  danger: boolean;
  seconds: number;
  size: number;
}) {
  const stroke = 5;
  const r = (size - stroke) / 2 - 0.5;
  const c = 2 * Math.PI * r;
  return (
    <View
      style={{ width: size, height: size }}
      accessibilityRole="timer"
      accessibilityLabel={`남은 시간 ${seconds}초`}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} stroke={color.bg.neutralWeak} />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke={danger ? color.bg.criticalSolid : color.bg.brandSolid}
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - pct)}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, s.ringLabel]} pointerEvents="none">
        <Text variant="t7-bold" color={danger ? 'critical' : 'neutral'} tabular>
          {seconds}
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  progress: { paddingHorizontal: space.x5, paddingTop: space.x1, width: '100%', alignSelf: 'center' },
  body: {
    paddingHorizontal: space.x5,
    paddingBottom: space.x6,
    width: '100%',
    alignSelf: 'center',
  },
  question: { alignItems: 'center' },
  directionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.x2 },
  actions: { flexDirection: 'row', gap: space.x2, marginTop: space.x3 },
  ringLabel: { alignItems: 'center', justifyContent: 'center' },
});
