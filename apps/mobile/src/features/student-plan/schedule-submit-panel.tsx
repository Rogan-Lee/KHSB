import {
  CalendarClock,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  Clock,
  Hourglass,
  type LucideIcon,
} from 'lucide-react-native';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Badge,
  BottomSheet,
  Button,
  color,
  Columns,
  confirm,
  IconTile,
  InfoRow,
  ListRow,
  Notice,
  Press,
  radius,
  Section,
  space,
  Text,
  TextField,
  toast,
  type Tone,
} from '@/design';
import {
  SCHEDULE_PROPOSAL_STATUS,
  submitStudentSchedule,
  type AttendanceSlot,
  type OutingSlot,
  type ScheduleProposal,
  type ScheduleSlots,
  type StudentScheduleResponse,
} from '@/lib/api/student-plan';

import { fmtDateShort, fmtKstDate, isRangeValid, sortAttendance, sortOutings, WEEK_DAYS } from './format';
import { ScheduleView } from './schedule-table';
import { ScheduleSlotsEditor } from './slots-editor';

// 웹 포털 ScheduleSubmitPanel 과 같은 구성: 안내 → 등하원·외출 편집 → 메모 → "스케줄 제출하기" → 제출 이력.
// 앱에서는 여기에 진행 중인 제출 상태 안내 · 지금 적용 중인 스케줄(불러와서 고치기) · 이력 상세를 더했다.
// 태블릿: 왼쪽 작성, 오른쪽 지금 스케줄 + 제출 이력.

const MAX_MEMO = 500;

/** 진행 중인 최신 제출 안내 */
function progressNotice(p: ScheduleProposal): { tone: Tone; icon: LucideIcon; text: string } | null {
  const when = p.scheduledFor ? `${fmtDateShort(p.scheduledFor)}부터` : '정해진 날부터';
  switch (p.status) {
    case 'SUBMITTED':
      return {
        tone: 'info',
        icon: Clock,
        text: `${p.version}번째 제출을 운영진이 검토하고 있어요. 확인 후 학부모님께 안내돼요.`,
      };
    case 'PROPOSED':
      return {
        tone: 'warn',
        icon: Hourglass,
        text: `학부모님 승인을 기다리고 있어요. 승인되면 ${when} 적용돼요.`,
      };
    case 'APPROVED':
      return { tone: 'info', icon: CircleCheck, text: `학부모님이 승인했어요. ${when} 입퇴실 일정에 반영돼요.` };
    case 'REJECTED':
      return {
        tone: 'bad',
        icon: CircleAlert,
        text: `${p.version}번째 제출이 반려됐어요. 내용을 고쳐서 다시 제출해 주세요.`,
      };
    default:
      return null;
  }
}

/** 요일별 슬롯 → 편집기 입력값 (편집기는 요일당 1칸) */
function toEditable(slots: ScheduleSlots): { attendance: AttendanceSlot[]; outings: OutingSlot[] } {
  const seen = new Set<number>();
  const attendance = sortAttendance(slots.attendance).filter((a) => {
    if (seen.has(a.dayOfWeek)) return false;
    seen.add(a.dayOfWeek);
    return true;
  });
  return {
    attendance: attendance.map((a) => ({ ...a })),
    outings: sortOutings(slots.outings).map((o) => ({ ...o, reason: o.reason ?? '' })),
  };
}

function sameSlots(a: ScheduleSlots, b: ScheduleSlots): boolean {
  const key = (x: ScheduleSlots) =>
    JSON.stringify([
      sortAttendance(x.attendance).map((s) => [s.dayOfWeek, s.startTime, s.endTime]),
      sortOutings(x.outings).map((o) => [o.dayOfWeek, o.outStart, o.outEnd, o.reason ?? '']),
    ]);
  return key(a) === key(b);
}

export function ScheduleSubmitPanel({
  data,
  isTablet,
  onSubmitted,
}: {
  data: StudentScheduleResponse;
  isTablet: boolean;
  onSubmitted: () => void;
}) {
  const [attendance, setAttendance] = useState<AttendanceSlot[]>([]);
  const [outings, setOutings] = useState<OutingSlot[]>([]);
  const [memo, setMemo] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [detail, setDetail] = useState<ScheduleProposal | null>(null);

  const latest = data.proposals[0];
  const notice = latest ? progressNotice(latest) : null;
  const hasCurrent = data.current.attendance.length > 0 || data.current.outings.length > 0;

  /** 편집기에 스케줄 채우기 — 작성 중이면 확인 후. 채웠으면 true */
  const load = async (slots: ScheduleSlots): Promise<boolean> => {
    if (attendance.length > 0 || outings.length > 0) {
      const ok = await confirm({
        title: '작성 중인 내용을 바꿀까요?',
        message: '지금 입력한 등하원·외출 시간이 불러온 스케줄로 바뀌어요.',
        confirmText: '불러오기',
      });
      if (!ok) return false;
    }
    const next = toEditable(slots);
    setAttendance(next.attendance);
    setOutings(next.outings);
    setShowErrors(false);
    toast('스케줄을 불러왔어요. 고칠 부분만 바꿔 주세요');
    return true;
  };

  const submit = async () => {
    if (busy.current) return;
    if (attendance.length === 0) {
      toast('등하원 요일을 1개 이상 선택해 주세요', 'error');
      return;
    }
    const invalid =
      attendance.some((a) => !isRangeValid(a.startTime, a.endTime)) ||
      outings.some((o) => !isRangeValid(o.outStart, o.outEnd));
    if (invalid) {
      setShowErrors(true);
      toast('시간을 다시 확인해 주세요', 'error');
      return;
    }
    busy.current = true;
    setPending(true);
    try {
      await submitStudentSchedule({
        attendance,
        outings: outings.map((o) => ({ ...o, reason: o.reason?.trim() || null })),
        memo: memo.trim(),
      });
      toast('스케줄을 제출했어요. 운영진 검토 후 학부모님께 안내돼요.', 'success');
      setMemo('');
      setShowErrors(false);
      onSubmitted();
    } catch (e) {
      toast(e instanceof Error ? e.message : '제출하지 못했어요', 'error');
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  const intro = (
    <View style={s.intro}>
      <Text variant="t7-bold" accessibilityRole="header">
        다음 주 등원 스케줄을 알려주세요
      </Text>
      <Text variant="t4-regular" color="neutralSubtle" style={{ marginTop: space.x1_5 }}>
        등하원 시간과 학원·외출 일정을 입력해 주세요. 운영진 확인과 학부모님 승인을 거쳐 입퇴실 일정에 반영돼요.
      </Text>
    </View>
  );

  const progress = notice && latest && (
    <Notice tone={notice.tone} icon={notice.icon} onPress={() => setDetail(latest)}>
      {notice.text}
    </Notice>
  );

  const form = (
    <>
      <Section>
        <ScheduleSlotsEditor
          attendance={attendance}
          outings={outings}
          onAttendanceChange={setAttendance}
          onOutingsChange={setOutings}
          showErrors={showErrors}
          disabled={pending}
        />
      </Section>

      <Section>
        <TextField
          label="메모"
          indicator="선택"
          value={memo}
          onChangeText={setMemo}
          placeholder="특이사항이 있으면 적어 주세요"
          multiline
          minHeight={96}
          maxLength={MAX_MEMO}
          showCount
          editable={!pending}
        />
      </Section>

      <Button variant="primary" size="xl" block loading={pending} onPress={() => void submit()}>
        스케줄 제출하기
      </Button>
    </>
  );

  const current = (
    <CurrentSection
      slots={data.current}
      hasCurrent={hasCurrent}
      layout={isTablet ? 'grid' : 'rows'}
      collapsible={!isTablet}
      onLoad={() => void load(data.current)}
    />
  );

  const history = data.proposals.length > 0 && (
    <Section title="제출 이력" flush>
      {data.proposals.map((h) => {
        const st = SCHEDULE_PROPOSAL_STATUS[h.status] ?? { label: h.status, tone: 'gray' as const };
        return (
          <ListRow
            key={h.id}
            leading={<IconTile icon={CalendarClock} tone="gray" />}
            title={
              <Text variant="t5-medium" tabular>
                {h.version}번째 제출
              </Text>
            }
            description={
              <Text variant="t4-regular" color="neutralSubtle" tabular>
                {fmtKstDate(h.createdAt)} 제출{h.committedAt ? ` · ${fmtKstDate(h.committedAt)} 반영` : ''}
              </Text>
            }
            trailing={<Badge tone={st.tone}>{st.label}</Badge>}
            onPress={() => setDetail(h)}
          />
        );
      })}
    </Section>
  );

  return (
    <>
      {isTablet ? (
        <Columns
          left={
            <>
              {intro}
              {progress}
              {form}
            </>
          }
          right={
            <>
              {current}
              {history}
            </>
          }
        />
      ) : (
        <View style={{ gap: space.x3 }}>
          {intro}
          {progress}
          {current}
          {form}
          {history ? <View style={{ paddingTop: space.x3 }}>{history}</View> : null}
        </View>
      )}

      <ProposalSheet
        proposal={detail}
        onClose={() => setDetail(null)}
        onLoad={(slots) => {
          void load(slots).then((ok) => ok && setDetail(null));
        }}
      />
    </>
  );
}

// ── 지금 적용 중인 스케줄 ─────────────────────────────────────────────────

function summary(slots: ScheduleSlots): string {
  const days = WEEK_DAYS.filter((d) => slots.attendance.some((a) => a.dayOfWeek === d.value)).map((d) => d.label);
  const times = new Set(slots.attendance.map((a) => `${a.startTime}~${a.endTime}`));
  const parts = [days.length ? `${days.join('·')} 등원` : '등원 요일 없음'];
  if (times.size === 1) parts.push([...times][0]);
  if (slots.outings.length) parts.push(`외출 ${slots.outings.length}개`);
  return parts.join(' · ');
}

function CurrentSection({
  slots,
  hasCurrent,
  layout,
  collapsible,
  onLoad,
}: {
  slots: ScheduleSlots;
  hasCurrent: boolean;
  layout: 'rows' | 'grid';
  collapsible: boolean;
  onLoad: () => void;
}) {
  const [open, setOpen] = useState(!collapsible);
  const expanded = !collapsible || open;

  return (
    <Section
      title="지금 적용 중인 스케줄"
      description={hasCurrent ? '입퇴실 관리에 쓰이는 스케줄이에요' : undefined}
      action={
        hasCurrent ? (
          <Button variant="weak" size="xs" onPress={onLoad} accessibilityLabel="지금 스케줄을 편집기로 불러오기">
            불러오기
          </Button>
        ) : undefined
      }>
      {!hasCurrent ? (
        <Text variant="t4-regular" color="neutralSubtle">
          아직 등록된 등원 스케줄이 없어요. 아래에서 처음 제출해 주세요.
        </Text>
      ) : (
        <View style={{ gap: space.x3 }}>
          {collapsible && (
            <Press
              onPress={() => setOpen((v) => !v)}
              scale={0}
              pressedBg
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={expanded ? '스케줄 접기' : '스케줄 펼치기'}
              style={s.summary}>
              <Text variant="t4-medium" color="neutralMuted" tabular style={{ flex: 1, minWidth: 0 }}>
                {summary(slots)}
              </Text>
              {expanded ? (
                <ChevronUp color={color.fg.neutralSubtle} size={18} strokeWidth={2.2} />
              ) : (
                <ChevronDown color={color.fg.neutralSubtle} size={18} strokeWidth={2.2} />
              )}
            </Press>
          )}
          {expanded && <ScheduleView slots={slots} layout={layout} />}
        </View>
      )}
    </Section>
  );
}

// ── 제출 이력 상세 ────────────────────────────────────────────────────────

function ProposalSheet({
  proposal,
  onClose,
  onLoad,
}: {
  proposal: ScheduleProposal | null;
  onClose: () => void;
  onLoad: (slots: ScheduleSlots) => void;
}) {
  // 닫히는 애니메이션 동안 내용을 유지
  const [shown, setShown] = useState<ScheduleProposal | null>(proposal);
  if (proposal && proposal !== shown) setShown(proposal);
  const p = proposal ?? shown;
  if (!p) return null;

  const st = SCHEDULE_PROPOSAL_STATUS[p.status] ?? { label: p.status, tone: 'gray' as const };
  const adjusted = p.final && !sameSlots(p.final, p.submitted) ? p.final : null;
  const loadable = adjusted ?? p.submitted;

  return (
    <BottomSheet
      open={!!proposal}
      onClose={onClose}
      title={`${p.version}번째 제출`}
      footer={
        <>
          <Button variant="gray" size="xl" style={{ flex: 1 }} onPress={onClose}>
            닫기
          </Button>
          <Button variant="primary" size="xl" style={{ flex: 1 }} onPress={() => onLoad(loadable)}>
            불러와서 고치기
          </Button>
        </>
      }>
      <View>
        <InfoRow label="상태">
          <Badge tone={st.tone} size="md">
            {st.label}
          </Badge>
        </InfoRow>
        <InfoRow label="제출일">{fmtKstDate(p.createdAt)}</InfoRow>
        {p.scheduledFor && p.status !== 'COMMITTED' && p.status !== 'SUPERSEDED' ? (
          <InfoRow label="적용 예정일">{fmtDateShort(p.scheduledFor)}</InfoRow>
        ) : null}
        {p.committedAt ? <InfoRow label="반영일">{fmtKstDate(p.committedAt)}</InfoRow> : null}
      </View>

      {adjusted && (
        <View style={s.block}>
          <Text variant="t5-bold">운영진이 조정한 스케줄</Text>
          <ScheduleView slots={adjusted} />
        </View>
      )}

      <View style={s.block}>
        <Text variant="t5-bold">{adjusted ? '처음 제출한 스케줄' : '제출한 스케줄'}</Text>
        <ScheduleView slots={p.submitted} />
      </View>

      {p.memo ? (
        <View style={s.block}>
          <Text variant="t5-bold">메모</Text>
          <Text variant="t4-regular" color="neutralMuted" selectable>
            {p.memo}
          </Text>
        </View>
      ) : null}
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  intro: { paddingHorizontal: space.x1, paddingBottom: space.x2, paddingTop: space.x3 },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x2,
    minHeight: 44,
    marginHorizontal: -space.x2,
    paddingHorizontal: space.x2,
    borderRadius: radius.r3,
  },
  block: { gap: space.x2, marginTop: space.x2 },
});
