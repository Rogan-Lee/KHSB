import { CalendarClock, CalendarDays, CircleCheck, MessageSquare, MessageSquareWarning, Users } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  color,
  confirm,
  EmptyState,
  ErrorState,
  IconTile,
  Notice,
  radius,
  Screen,
  Section,
  Skeleton,
  space,
  Stack,
  Text,
  toast,
} from '@/design';
import { useChildQuery } from '@/features/parent/child-query';
import { daysUntil, kstDateTimeLabel, ymdLabel } from '@/features/parent/notice-format';
import { ScheduleFeedbackSheet } from '@/features/parent/schedule-feedback-sheet';
import {
  ScheduleDiffTable,
  ScheduleOutingList,
  ScheduleWeekTable,
  scheduleDayRows,
} from '@/features/parent/schedule-slots';
import {
  approveSchedule,
  parentServicePaths,
  type ParentScheduleResponse,
  type ScheduleProposalView,
} from '@/lib/api/parent-services';
import { refreshBadges } from '@/lib/badges';
import { ChildChips, useParentChild } from '@/lib/parent-child';
import { useResponsive } from '@/lib/responsive';

/**
 * 학부모 등원 스케줄 — 운영진이 보낸 스케줄(안)을 지금 스케줄과 비교해 보고 승인 / 수정 요청.
 * 웹 /r/schedule/[token] 과 같은 규칙. 승인할 게 없으면 지금 적용 중인 스케줄을 보여 준다.
 */
export default function ParentScheduleScreen() {
  const { selected } = useParentChild();
  const { isTablet } = useResponsive();
  const childId = selected?.id ?? null;
  const q = useChildQuery<ParentScheduleResponse>(childId ? parentServicePaths.schedule(childId) : null, childId);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<{ proposalId: string; beforeApproval: boolean } | null>(null);

  const data = q.data;
  const pending = data?.pending ?? null;

  const approve = async (p: ScheduleProposalView) => {
    if (busy) return;
    const when = p.scheduledFor ? `${ymdLabel(p.scheduledFor)}부터 적용돼요.` : '운영진이 적용일을 정해 반영해요.';
    const ok = await confirm({
      title: '이 스케줄로 승인할까요?',
      message: when,
      confirmText: '승인하기',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await approveSchedule(p.id);
      toast('승인했어요. 감사합니다!', 'success');
      refreshBadges();
      await q.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : '승인하지 못했어요', 'error');
    } finally {
      setBusy(false);
    }
  };

  const footer = pending
    ? [
        <Button
          key="reject"
          variant="gray"
          size="xl"
          block
          disabled={busy}
          onPress={() => setSheet({ proposalId: pending.id, beforeApproval: true })}>
          수정 요청
        </Button>,
        <Button key="approve" variant="primary" size="xl" block loading={busy} onPress={() => void approve(pending)}>
          승인하기
        </Button>,
      ]
    : undefined;

  let body;
  if (!selected) {
    body = <EmptyState icon={Users} title="연결된 자녀가 없어요" description="자녀를 먼저 연결해 주세요." />;
  } else if (!data || q.isLoading) {
    body = q.error ? <ErrorState message={q.error} onRetry={q.retry} /> : <ScheduleSkeleton />;
  } else if (pending) {
    body = <PendingProposal data={data} proposal={pending} />;
  } else {
    body = (
      <CurrentSchedule
        data={data}
        onFeedback={(p) => setSheet({ proposalId: p.id, beforeApproval: false })}
      />
    );
  }

  return (
    <Screen
      kind="push"
      title="등원 스케줄"
      backFallback="/(parent)/(tabs)/menu"
      footer={footer}
      refreshing={q.isRefreshing}
      onRefresh={childId ? () => void q.refresh() : undefined}
      maxWidth={isTablet ? 640 : undefined}>
      <Stack>
        <ChildChips />
        {body}
      </Stack>
      {sheet && (
        <ScheduleFeedbackSheet
          open
          proposalId={sheet.proposalId}
          beforeApproval={sheet.beforeApproval}
          onClose={() => setSheet(null)}
          onSent={() => {
            setSheet(null);
            refreshBadges();
            void q.refresh();
          }}
        />
      )}
    </Screen>
  );
}

// ─── 승인 대기 ───────────────────────────────────────────────────────

function PendingProposal({ data, proposal }: { data: ParentScheduleResponse; proposal: ScheduleProposalView }) {
  const rows = scheduleDayRows(data.current.attendance, proposal.attendance);
  const changed = rows.filter((r) => r.changed).length;
  const firstTime = data.current.attendance.length === 0;
  const dday = proposal.scheduledFor ? daysUntil(proposal.scheduledFor) : null;

  return (
    <>
      <Section>
        <View style={{ gap: space.x3 }}>
          <Badge tone="brand" size="md">
            승인이 필요해요
          </Badge>
          <Text variant="t7-bold" accessibilityRole="header">
            {data.studentName} 학생의 새 등원 스케줄을 확인해 주세요
          </Text>
          <Text variant="t5-regular" color="neutralMuted">
            {firstTime
              ? '운영진이 정리한 주간 등원 스케줄(안)이에요.'
              : changed > 0
                ? `지금 스케줄과 비교해 ${changed}개 요일이 달라져요.`
                : '등하원 시간은 그대로이고, 학원·외출 일정만 확인해 주세요.'}
          </Text>
        </View>
        {proposal.scheduledFor && (
          <View style={s.when}>
            <IconTile icon={CalendarClock} tone="info" size={40} round />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="t3-regular" color="neutralSubtle">
                적용 시작일
              </Text>
              <Text variant="t5-bold">
                {ymdLabel(proposal.scheduledFor)}부터
                {dday != null && dday > 0 ? ` · ${dday}일 뒤` : dday === 0 ? ' · 오늘' : ''}
              </Text>
            </View>
          </View>
        )}
      </Section>

      <Section title="요일별 등하원" description={firstTime ? undefined : '바뀌는 요일은 주황색으로 표시했어요.'}>
        {firstTime ? (
          <ScheduleWeekTable slots={proposal.attendance} />
        ) : (
          <ScheduleDiffTable rows={rows} />
        )}
      </Section>

      <Section title="학원·외출">
        <ScheduleOutingList outings={proposal.outings} before={firstTime ? undefined : data.current.outings} />
      </Section>

      {proposal.adminNote ? (
        <Notice tone="info" icon={MessageSquare} title="운영진 메모">
          {proposal.adminNote}
        </Notice>
      ) : null}

      <FeedbackHistory proposal={proposal} />
    </>
  );
}

// ─── 승인할 것이 없을 때 — 지금 스케줄 ─────────────────────────────────

function CurrentSchedule({
  data,
  onFeedback,
}: {
  data: ParentScheduleResponse;
  onFeedback: (p: ScheduleProposalView) => void;
}) {
  const latest = data.latest;
  const hasCurrent = data.current.attendance.length > 0 || data.current.outings.length > 0;
  const applied = latest && (latest.status === 'APPROVED' || latest.status === 'COMMITTED');

  return (
    <>
      {latest && applied && (
        <Section>
          <View style={s.statusRow}>
            <IconTile icon={CircleCheck} tone="ok" solid size={44} round />
            <View style={{ flex: 1, minWidth: 0, gap: space.x0_5 }}>
              <Text variant="t6-bold">
                {latest.status === 'COMMITTED' ? '새 스케줄이 적용됐어요' : '승인한 스케줄이 곧 적용돼요'}
              </Text>
              <Text variant="t4-regular" color="neutralSubtle">
                {latest.status === 'COMMITTED'
                  ? latest.committedAt
                    ? `${kstDateTimeLabel(latest.committedAt)}에 반영됐어요.`
                    : '지금 스케줄에 반영됐어요.'
                  : latest.scheduledFor
                    ? `${ymdLabel(latest.scheduledFor)}부터 적용돼요.`
                    : '운영진이 확인하고 반영해요.'}
              </Text>
            </View>
          </View>
          <Button
            variant="weak"
            size="lg"
            block
            icon={MessageSquareWarning}
            onPress={() => onFeedback(latest)}
            style={{ marginTop: space.x4 }}>
            수정 요청하기
          </Button>
        </Section>
      )}

      {latest && latest.status === 'REJECTED' && (
        <Notice tone="warn" icon={MessageSquareWarning} title="수정 요청을 보냈어요">
          운영진이 확인하고 다시 안내드릴 거예요.
        </Notice>
      )}

      {latest?.status === 'APPROVED' && (
        <Section title="적용될 스케줄">
          <ScheduleWeekTable slots={latest.attendance} />
        </Section>
      )}

      {hasCurrent ? (
        <>
          <Section title="지금 스케줄" description="독서실 입퇴실 관리에 쓰는 주간 등원 일정이에요.">
            <ScheduleWeekTable slots={data.current.attendance} />
          </Section>
          <Section title="학원·외출">
            <ScheduleOutingList outings={data.current.outings} />
          </Section>
        </>
      ) : (
        !latest && (
          <Section>
            <EmptyState
              icon={CalendarDays}
              title="등록된 등원 스케줄이 없어요"
              description="운영진이 스케줄을 보내면 여기에서 확인하고 승인할 수 있어요."
              style={{ paddingVertical: space.x8 }}
            />
          </Section>
        )
      )}

      {latest && <FeedbackHistory proposal={latest} />}
    </>
  );
}

function FeedbackHistory({ proposal }: { proposal: ScheduleProposalView }) {
  if (proposal.feedbacks.length === 0) return null;
  return (
    <Section title="보낸 의견">
      <View style={{ gap: space.x2 }}>
        {proposal.feedbacks.map((f) => (
          <View key={f.id} style={s.feedback}>
            <Text variant="t2-regular" color="neutralSubtle" tabular>
              {kstDateTimeLabel(f.createdAt)}
            </Text>
            <Text variant="t5-regular" selectable>
              {f.content}
            </Text>
          </View>
        ))}
      </View>
    </Section>
  );
}

function ScheduleSkeleton() {
  return (
    <Stack>
      <View style={s.skel}>
        <Skeleton style={{ width: 96, height: 24, borderRadius: radius.r1_5 }} />
        <Skeleton style={{ width: '90%', height: 26 }} />
        <Skeleton style={{ width: '70%', height: 18 }} />
        <Skeleton style={{ height: 64, borderRadius: radius.r4 }} />
      </View>
      <View style={s.skel}>
        <Skeleton style={{ width: 110, height: 22 }} />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} style={{ height: 40, borderRadius: radius.r2 }} />
        ))}
      </View>
    </Stack>
  );
}

const s = StyleSheet.create({
  when: {
    marginTop: space.x4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    borderRadius: radius.r4,
    backgroundColor: color.bg.layerFill,
    padding: space.x3_5,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: space.x3_5 },
  feedback: { backgroundColor: color.bg.layerFill, borderRadius: radius.r3_5, padding: space.x3_5, gap: space.x1 },
  skel: { backgroundColor: color.bg.layerDefault, borderRadius: radius.r5, padding: space.x5, gap: space.x3 },
});
