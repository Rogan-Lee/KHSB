import { useRouter, type Href } from 'expo-router';
import { BookOpenCheck, Link2, RefreshCw, RotateCcw, Send, UserPlus } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';

import {
  Avatar,
  Badge,
  BottomSheet,
  Button,
  color,
  confirm,
  EmptyState,
  ErrorState,
  InfoRow,
  ListRow,
  Notice,
  Section,
  space,
  Stack,
  StatGrid,
  Text,
  toast,
} from '@/design';
import {
  reissueVocabAttempt,
  staffVocabExamPath,
  type StaffVocabAttempt,
  type StaffVocabExam,
  type StaffVocabExamResponse,
} from '@/lib/api/staff-learning';
import { useMobileQuery } from '@/lib/mobile-api';

import { DetailFrame } from './detail-frame';
import { formatDate, formatDateTime, formatWhen } from './format';
import { shareMessage } from './share';
import { ListSkeleton, StatSkeleton } from './skeletons';
import { scoreTone, VOCAB_STATUS } from './status';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 응시 링크 보내기·재발급 — 시트를 닫은 뒤 확인창을 띄운다(iOS 는 모달 위에 모달을 겹치지 못함) */
export function useVocabAttemptActions(onChanged?: () => void) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const lock = useRef(false);

  const share = useCallback(async (attempt: StaffVocabAttempt) => {
    if (!attempt.shareText) return;
    await shareMessage(attempt.shareText, `${attempt.student.name} 영단어 시험`);
  }, []);

  const reissue = useCallback(
    async (attempt: StaffVocabAttempt) => {
      if (lock.current) return;
      await wait(320);
      const ok = await confirm({
        title: '응시 링크를 다시 만들까요?',
        message:
          attempt.status === 'IN_PROGRESS'
            ? '지금 링크는 더 이상 열리지 않고, 풀던 문제도 처음부터 다시 풀어야 해요.'
            : '지금 링크는 더 이상 열리지 않아요. 새 링크를 학생에게 다시 보내 주세요.',
        confirmText: '다시 만들기',
        destructive: true,
      });
      if (!ok) return;
      lock.current = true;
      setBusyId(attempt.id);
      try {
        const { attempt: next } = await reissueVocabAttempt(attempt.id);
        toast('새 응시 링크를 만들었어요', 'success');
        onChanged?.();
        if (next.shareText) await shareMessage(next.shareText, `${next.student.name} 영단어 시험`);
      } catch (e) {
        toast(e instanceof Error ? e.message : '링크를 다시 만들지 못했어요', 'error');
      } finally {
        lock.current = false;
        setBusyId(null);
      }
    },
    [onChanged],
  );

  return { share, reissue, busyId };
}

/** 응시 1건 행 — 제출이면 점수, 아니면 상태 배지 */
export function AttemptRow({
  attempt,
  showExam = true,
  onPress,
}: {
  attempt: StaffVocabAttempt;
  showExam?: boolean;
  onPress: () => void;
}) {
  const st = VOCAB_STATUS[attempt.status];
  const submitted = attempt.status === 'SUBMITTED';
  const when = attempt.submittedAt ?? attempt.startedAt ?? attempt.assignedAt;
  const whenLabel = submitted ? '제출' : attempt.startedAt ? '시작' : '배정';
  const detail = [
    attempt.student.grade,
    showExam ? attempt.examTitle : null,
    `${formatWhen(when)} ${whenLabel}`,
  ].filter(Boolean);
  return (
    <ListRow
      onPress={onPress}
      leading={<Avatar name={attempt.student.name} size={40} />}
      title={
        <Text variant="t5-medium" numberOfLines={1}>
          {attempt.student.name}
        </Text>
      }
      description={
        <Text variant="t4-regular" color="neutralSubtle" numberOfLines={1}>
          {detail.join(' · ')}
        </Text>
      }
      trailing={
        submitted && attempt.score != null ? (
          <View style={{ alignItems: 'flex-end' }}>
            <Text variant="t5-bold" color={scoreTone(attempt.score)} tabular>
              {`${Math.round(attempt.score)}점`}
            </Text>
            <Text variant="t2-regular" color="neutralSubtle" tabular>
              {`${attempt.correctCount}/${attempt.totalQuestions}`}
            </Text>
          </View>
        ) : attempt.linkExpired && attempt.canReissue ? (
          <Badge tone="warn">링크 만료</Badge>
        ) : (
          <Badge tone={st.tone}>{st.label}</Badge>
        )
      }
      chevron={false}
    />
  );
}

/** 시험 1건 행 */
export function ExamRow({
  exam,
  selected = false,
  onPress,
}: {
  exam: StaffVocabExam;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <ListRow
      onPress={onPress}
      style={selected ? { backgroundColor: color.bg.neutralWeak } : undefined}
      meta={
        exam.isRetake ? (
          <Badge tone="warn">재시험</Badge>
        ) : undefined
      }
      title={
        <Text variant="t5-medium" numberOfLines={2}>
          {exam.title}
        </Text>
      }
      description={
        <Text variant="t4-regular" color="neutralSubtle" numberOfLines={1}>
          {`${exam.bookName} · ${exam.directionLabel} · ${exam.questionCount}문항`}
        </Text>
      }
      trailing={
        <View style={{ alignItems: 'flex-end' }}>
          <Text variant="t4-bold" tabular>
            {`${exam.submittedCount}/${exam.assignedCount}`}
          </Text>
          <Text variant="t2-regular" color="neutralSubtle" tabular>
            {exam.avgScore != null ? `평균 ${exam.avgScore}점` : '제출'}
          </Text>
        </View>
      }
    />
  );
}

/** 응시 1건 시트 — 상태·점수·링크 기한 + 보내기/재발급 */
export function AttemptSheet({
  attempt,
  open,
  onClose,
  onShare,
  onReissue,
}: {
  /** 닫히는 동안에도 내용이 남도록 부모가 마지막 응시를 쥐고 open 만 끈다 */
  attempt: StaffVocabAttempt | null;
  open: boolean;
  onClose: () => void;
  onShare: (a: StaffVocabAttempt) => void;
  onReissue: (a: StaffVocabAttempt) => void;
}) {
  const a = attempt;
  const st = a ? VOCAB_STATUS[a.status] : null;
  const submitted = a?.status === 'SUBMITTED';
  const canShare = !!a?.shareText;
  const canReissue = !!a?.canReissue;
  return (
    <BottomSheet
      open={open && !!a}
      onClose={onClose}
      title={a ? `${a.student.name} · ${a.student.grade}` : undefined}
      description={a?.examTitle}
      footer={
        a && (canShare || canReissue) ? (
          <>
            {canReissue ? (
              <View style={{ flex: 1 }}>
                <Button
                  variant={canShare ? 'gray' : 'primary'}
                  size="lg"
                  block
                  icon={RefreshCw}
                  onPress={() => {
                    onClose();
                    onReissue(a);
                  }}>
                  다시 만들기
                </Button>
              </View>
            ) : null}
            {canShare ? (
              <View style={{ flex: 1 }}>
                <Button variant="primary" size="lg" block icon={Send} onPress={() => onShare(a)}>
                  링크 보내기
                </Button>
              </View>
            ) : null}
          </>
        ) : undefined
      }>
      {a && st ? (
        <View>
          <InfoRow label="상태">
            <Badge tone={a.linkExpired && canReissue ? 'warn' : st.tone} size="md">
              {a.linkExpired && canReissue ? '링크 만료' : st.label}
            </Badge>
          </InfoRow>
          {submitted ? (
            <InfoRow label="점수">
              <Text variant="t5-bold" color={scoreTone(a.score)} tabular>
                {`${a.score != null ? Math.round(a.score) : '-'}점 · ${a.correctCount}/${a.totalQuestions}`}
              </Text>
            </InfoRow>
          ) : null}
          <InfoRow label="배정">
            <Text variant="t5-medium" tabular>
              {formatDateTime(a.assignedAt)}
            </Text>
          </InfoRow>
          {a.submittedAt ? (
            <InfoRow label="제출">
              <Text variant="t5-medium" tabular>
                {formatDateTime(a.submittedAt)}
              </Text>
            </InfoRow>
          ) : a.expiresAt && a.status !== 'EXPIRED' ? (
            <InfoRow label="링크 기한">
              <Text variant="t5-medium" color={a.linkExpired ? 'critical' : 'neutral'} tabular>
                {a.linkExpired ? '지났어요' : `${formatDate(a.expiresAt)}까지`}
              </Text>
            </InfoRow>
          ) : null}
          {a.linkExpired && canReissue ? (
            <Notice tone="warn" icon={Link2} style={{ marginTop: space.x3 }}>
              링크 기한이 지났어요. 다시 만들어서 보내 주세요.
            </Notice>
          ) : submitted ? (
            <Notice tone="gray" icon={BookOpenCheck} style={{ marginTop: space.x3 }}>
              문항별 채점 결과와 재시험 출제는 웹 영단어 화면에서 할 수 있어요.
            </Notice>
          ) : a.status === 'EXPIRED' ? (
            <Notice tone="gray" icon={RotateCcw} style={{ marginTop: space.x3 }}>
              취소된 응시예요. 다시 보내려면 웹에서 새로 배정해 주세요.
            </Notice>
          ) : null}
        </View>
      ) : null}
    </BottomSheet>
  );
}

/** 시험 상세 — 배정된 학생별 응시 현황. 라우트 화면과 태블릿 패널이 같이 쓴다. */
export function VocabExamView({
  examId,
  inline = false,
  onClose,
  onChanged,
}: {
  examId: string;
  inline?: boolean;
  onClose?: () => void;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const q = useMobileQuery<StaffVocabExamResponse>(staffVocabExamPath(examId));
  const data = q.data && q.data.exam.id === examId ? q.data : null;
  const [sheet, setSheet] = useState<StaffVocabAttempt | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const actions = useVocabAttemptActions(() => {
    void q.refresh();
    onChanged?.();
  });

  const assignHref = `/(staff)/vocab/assign?examId=${encodeURIComponent(examId)}` as Href;

  if (!data) {
    return (
      <DetailFrame inline={inline} title="영단어 시험" onClose={onClose} surface="canvas">
        {q.error && !q.isLoading ? (
          <ErrorState message={q.error} onRetry={() => void q.retry()} />
        ) : (
          <Stack>
            <StatSkeleton cells={4} />
            <ListSkeleton rows={5} />
          </Stack>
        )}
      </DetailFrame>
    );
  }

  const { exam, attempts } = data;
  const order: Record<StaffVocabAttempt['status'], number> = {
    IN_PROGRESS: 0,
    ASSIGNED: 1,
    SUBMITTED: 2,
    EXPIRED: 3,
  };
  const sorted = [...attempts].sort(
    (x, y) => order[x.status] - order[y.status] || x.student.name.localeCompare(y.student.name, 'ko'),
  );

  return (
    <DetailFrame
      inline={inline}
      title="영단어 시험"
      onClose={onClose}
      surface="canvas"
      refreshing={q.isRefreshing}
      onRefresh={() => void q.refresh()}
      footer={
        <Button variant="primary" size="lg" block icon={UserPlus} onPress={() => router.push(assignHref)}>
          학생 배정하기
        </Button>
      }>
      <Stack>
        <Section>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.x1_5 }}>
            {exam.isRetake ? <Badge tone="warn">재시험</Badge> : null}
            <Badge>{exam.directionLabel}</Badge>
            <Badge>{`${exam.questionCount}문항`}</Badge>
          </View>
          <Text variant="t8-bold" style={{ marginTop: space.x3 }}>
            {exam.title}
          </Text>
          <Text variant="t4-regular" color="neutralSubtle" style={{ marginTop: space.x1 }}>
            {`${exam.bookName} · ${
              exam.perQuestionSeconds > 0 ? `문항당 ${exam.perQuestionSeconds}초` : '시간 제한 없음'
            } · ${formatDate(exam.createdAt)} 출제`}
          </Text>
        </Section>

        <Section>
          <StatGrid
            surface="plain"
            items={[
              { label: '배정', value: exam.assignedCount },
              { label: '제출', value: exam.submittedCount, tone: 'positive' },
              { label: '대기', value: exam.waitingCount, tone: exam.waitingCount > 0 ? 'warning' : 'neutral' },
              { label: '평균', value: exam.avgScore != null ? `${exam.avgScore}점` : '-' },
            ]}
          />
        </Section>

        <Section flush title="응시 현황" description="학생을 누르면 링크를 보내거나 다시 만들 수 있어요">
          {sorted.length === 0 ? (
            <EmptyState
              icon={UserPlus}
              title="아직 배정한 학생이 없어요"
              description="아래 버튼으로 학생을 골라 배정해 주세요."
              style={{ paddingVertical: space.x8 }}
            />
          ) : (
            sorted.map((a) => (
              <AttemptRow
                key={a.id}
                attempt={a}
                showExam={false}
                onPress={() => {
                  setSheet(a);
                  setSheetOpen(true);
                }}
              />
            ))
          )}
        </Section>
      </Stack>

      <AttemptSheet
        attempt={sheet}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onShare={(a) => void actions.share(a).then(() => setSheetOpen(false))}
        onReissue={(a) => void actions.reissue(a)}
      />
    </DetailFrame>
  );
}
