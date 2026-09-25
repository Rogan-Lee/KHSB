import { AlarmClock, CircleAlert, History, Lock, PencilLine, SpellCheck, Timer, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, color, IconTile, Notice, Screen, space, StatGrid, Text, useResponsive } from '@/design';
import type { StudentVocabAttempt } from '@/lib/api/student-learning';

import { formatTimeKST } from '@/features/student-tasks/status';

import { VOCAB_TABLET_WIDTH, vocabDueLabel } from './format';

/** 응시 전 안내 — 웹 /v/[token] VocabExperience 인트로와 같은 구성 */
export function VocabIntro({
  attempt,
  starting,
  error,
  onStart,
  refreshing,
  onRefresh,
}: {
  attempt: StudentVocabAttempt;
  starting: boolean;
  error: string | null;
  onStart: () => void;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const { isTablet } = useResponsive();
  const timed = attempt.perQuestionSeconds > 0;
  const resuming = attempt.status === 'IN_PROGRESS';
  const due = vocabDueLabel(attempt.expiresAt);

  return (
    <Screen
      kind="push"
      surface="panel"
      gutter={space.x5}
      maxWidth={isTablet ? VOCAB_TABLET_WIDTH : undefined}
      backFallback="/(student)/vocab"
      refreshing={refreshing}
      onRefresh={onRefresh}
      footer={
        <Button variant="primary" size="xl" block loading={starting} onPress={onStart}>
          {resuming ? '이어서 풀기' : '시작하기'}
        </Button>
      }>
      <View style={{ paddingTop: space.x3 }}>
        <IconTile icon={SpellCheck} tone="brand" size={56} round />

        <Text variant="t4-regular" color="neutralSubtle" style={{ marginTop: space.x5 }}>
          {attempt.studentName} 학생
        </Text>
        <Text variant="t9-bold" style={{ marginTop: space.x1 }}>
          {attempt.title}
        </Text>

        {/* 시험 요약 */}
        <StatGrid
          style={{ marginTop: space.x6 }}
          items={[
            { label: '문항 수', value: `${attempt.questionCount}문항` },
            { label: '문항당', value: timed ? `${attempt.perQuestionSeconds}초` : '제한 없음' },
            {
              label: '예상 시간',
              value: timed
                ? `약 ${Math.max(1, Math.ceil((attempt.questionCount * attempt.perQuestionSeconds) / 60))}분`
                : '—',
            },
          ]}
        />

        {error && (
          <Notice tone="bad" icon={CircleAlert} style={{ marginTop: space.x6 }}>
            {error}
          </Notice>
        )}

        {resuming && (
          <Notice tone="info" icon={History} title="풀던 시험이 있어요" style={{ marginTop: space.x6 }}>
            마지막으로 푼 문항 다음부터 이어서 풀어요.
          </Notice>
        )}

        {due?.urgent && attempt.expiresAt && !error && (
          <Notice tone="warn" icon={AlarmClock} title={due.label} style={{ marginTop: resuming ? space.x3 : space.x6 }}>
            오늘 {formatTimeKST(attempt.expiresAt)}까지 응시할 수 있어요.
          </Notice>
        )}

        {/* 안내 */}
        <Text variant="t5-bold" style={{ marginTop: space.x8 }}>
          시험 전에 확인해 주세요
        </Text>
        <View style={{ marginTop: space.x4, gap: space.x3 }}>
          {timed && (
            <RuleItem icon={Timer}>
              문항마다 {attempt.perQuestionSeconds}초가 주어져요. 시간이 지나면{' '}
              <Text variant="t4-medium" color="critical">
                오답
              </Text>
              으로 처리되고 다음 문항으로 넘어가요.
            </RuleItem>
          )}
          <RuleItem icon={PencilLine}>뜻이 여러 개여도 하나만 적으면 돼요.</RuleItem>
          <RuleItem icon={Lock}>제출하면 다시 풀 수 없어요. 조용한 곳에서 시작해 주세요.</RuleItem>
        </View>
      </View>
    </Screen>
  );
}

function RuleItem({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <View style={s.rule}>
      <Icon color={color.fg.neutralSubtle} size={16} strokeWidth={2.2} style={{ marginTop: 3 }} />
      <Text variant="t4-regular" color="neutralMuted" style={{ flex: 1, minWidth: 0 }}>
        {children}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  rule: { flexDirection: 'row', alignItems: 'flex-start', gap: space.x3 },
});
