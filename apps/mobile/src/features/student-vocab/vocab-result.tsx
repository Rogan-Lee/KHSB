import { BookOpen, Check, PartyPopper, X } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  color,
  IconTile,
  Notice,
  Screen,
  Segmented,
  space,
  StatGrid,
  Text,
  useResponsive,
} from '@/design';
import type { StudentVocabAttempt, VocabReviewItem } from '@/lib/api/student-learning';

import { fmtDuration, fmtScore, VOCAB_PASS_SCORE, VOCAB_TABLET_WIDTH } from './format';

/** 시험 결과 — 웹 /v/[token]/result 와 같은 구성 */
export function VocabResult({
  attempt,
  onDone,
}: {
  attempt: StudentVocabAttempt;
  /** "영단어 시험 목록으로" */
  onDone: () => void;
}) {
  const { isTablet } = useResponsive();
  const score = fmtScore(attempt.score);
  const pass = score >= VOCAB_PASS_SCORE;
  const correct = attempt.correctCount;
  const wrong = Math.max(0, attempt.totalQuestions - attempt.correctCount);

  return (
    <Screen
      kind="modal"
      title="시험 결과"
      surface="panel"
      gutter={space.x5}
      maxWidth={isTablet ? VOCAB_TABLET_WIDTH : undefined}
      backFallback="/(student)/vocab"
      footer={
        <Button variant="primary" size="xl" block onPress={onDone}>
          영단어 시험 목록으로
        </Button>
      }>
      {/* 결과 요약 */}
      <View style={s.hero}>
        <IconTile icon={pass ? PartyPopper : BookOpen} tone={pass ? 'ok' : 'warn'} size={64} round />
        <Text variant="t8-bold" align="center" style={{ marginTop: space.x5 }}>
          {pass ? '통과했어요!' : '조금만 더 외워봐요'}
        </Text>
        <Text variant="t4-regular" color="neutralSubtle" align="center" style={{ marginTop: space.x1_5 }}>
          {attempt.studentName} 학생 · {attempt.title}
        </Text>
        <View style={s.score} accessible accessibilityLabel={`${score}점`}>
          <Text variant="t14-bold" color={pass ? 'positive' : 'neutral'} tabular>
            {score}
          </Text>
          <Text variant="t7-bold" color={pass ? 'positive' : 'neutral'}>
            점
          </Text>
        </View>
      </View>

      {/* 정답 · 오답 · 소요 시간 */}
      <StatGrid
        style={{ marginTop: space.x6 }}
        items={[
          { label: '정답', value: `${correct}개`, tone: 'positive' },
          { label: '오답', value: `${wrong}개`, tone: wrong > 0 ? 'critical' : 'neutral' },
          { label: '소요 시간', value: fmtDuration(attempt.durationMs) },
        ]}
      />

      <ResultWords items={attempt.items} />

      <Text variant="t3-regular" color="neutralSubtle" align="center" style={{ marginTop: space.x8 }}>
        제출이 끝난 시험은 다시 볼 수 없어요.
      </Text>
    </Screen>
  );
}

type Filter = 'wrong' | 'all';

/** 단어 복습 — 틀린 단어 / 전체 */
function ResultWords({ items }: { items: VocabReviewItem[] }) {
  const wrong = items.filter((i) => !i.isCorrect);
  const allCorrect = wrong.length === 0;
  const [filter, setFilter] = useState<Filter>(allCorrect ? 'all' : 'wrong');
  const shown = filter === 'wrong' ? wrong : items;

  return (
    <View style={{ marginTop: space.x10 }}>
      <Text variant="t6-bold">단어 복습</Text>

      <Segmented<Filter>
        style={{ marginTop: space.x3 }}
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'wrong', label: `틀린 단어 ${wrong.length}` },
          { value: 'all', label: `전체 ${items.length}` },
        ]}
      />

      {allCorrect && (
        <Notice tone="ok" icon={PartyPopper} title="모두 맞았어요! 완벽해요" style={{ marginTop: space.x4 }}>
          틀린 단어 없이 {items.length}개를 전부 맞혔어요.
        </Notice>
      )}

      {shown.length > 0 && (
        <View style={{ marginTop: space.x2 }}>
          {shown.map((it, i) => (
            <WordRow key={it.id} item={it} first={i === 0} />
          ))}
        </View>
      )}
    </View>
  );
}

function WordRow({ item, first }: { item: VocabReviewItem; first: boolean }) {
  const enToKo = item.direction === 'EN_TO_KO';
  const question = enToKo ? item.word : item.meanings.join(' / ');
  const answer = enToKo ? item.meanings.join(', ') : item.word;
  const mine = item.studentAnswer?.trim() ?? '';
  const correct = !!item.isCorrect;

  return (
    <View style={[s.word, !first && s.wordDivider]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={s.wordHead}>
          <Text variant="t5-bold" style={{ flexShrink: 1 }}>
            {question}
          </Text>
          <Badge tone="gray" style={{ alignSelf: 'center' }}>
            {enToKo ? '영→한' : '한→영'}
          </Badge>
        </View>
        <View style={s.answerRow}>
          <Text variant="t3-regular" color="neutralSubtle" style={s.answerLabel}>
            정답
          </Text>
          <Text variant="t4-medium" style={{ flex: 1, minWidth: 0 }}>
            {answer}
          </Text>
        </View>
        <View style={[s.answerRow, { marginTop: space.x1 }]}>
          <Text variant="t3-regular" color="neutralSubtle" style={s.answerLabel}>
            내 답
          </Text>
          <Text
            variant="t4-medium"
            color={correct ? 'positive' : mine ? 'critical' : 'placeholder'}
            style={{ flex: 1, minWidth: 0 }}>
            {mine || '입력 안 함'}
          </Text>
        </View>
      </View>
      <View
        style={[
          s.mark,
          { backgroundColor: correct ? color.bg.positiveWeak : color.bg.criticalWeak },
        ]}
        accessible
        accessibilityRole="image"
        accessibilityLabel={correct ? '정답' : '오답'}>
        {correct ? (
          <Check color={color.fg.positive} size={14} strokeWidth={3} />
        ) : (
          <X color={color.fg.critical} size={14} strokeWidth={3} />
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  hero: { alignItems: 'center', paddingTop: space.x6 },
  score: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: space.x0_5,
    marginTop: space.x5,
  },
  word: { flexDirection: 'row', alignItems: 'flex-start', gap: space.x3, paddingVertical: space.x4 },
  wordDivider: { borderTopWidth: 1, borderTopColor: color.stroke.neutralSubtle },
  wordHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.x1_5, rowGap: space.x1 },
  answerRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.x3, marginTop: space.x2 },
  answerLabel: { minWidth: 32 },
  mark: {
    width: space.x6,
    height: space.x6,
    borderRadius: space.x3,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.x0_5,
  },
});
