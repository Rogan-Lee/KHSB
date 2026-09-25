import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import {
  BottomSheet,
  Button,
  Chip,
  ChipGroup,
  confirm,
  Press,
  space,
  Text,
  TextField,
  toast,
} from '@/design';
import type { MobileOuting } from '@/lib/mobile-api';
import {
  patchAttendance,
  type AttendanceAction,
  type AttendancePatch,
  type OpsAttendanceItem,
} from '@/lib/api/staff-ops';

import { ATTENDANCE_TYPE_OPTIONS, isValidTime, maskTime } from './status';

/** KST 현재 "HH:MM" */
export function nowKstTime() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(11, 16);
}

const ACTION_DONE: Partial<Record<AttendanceAction, string>> = {
  CHECK_IN: '입실 처리했어요',
  CHECK_OUT: '퇴실 처리했어요',
  START_OUTING: '외출 처리했어요',
  RETURN: '복귀 처리했어요',
  MARK_ABSENT: '결석 처리했어요',
};

/** 상태 전환 버튼 한 번 누르기 — 중복 방지 + 토스트 */
export function useAttendanceAction(item: OpsAttendanceItem | null, onChanged?: () => void) {
  const [busy, setBusy] = useState<AttendanceAction | null>(null);

  const run = async (action: AttendanceAction) => {
    if (!item || busy) return false;
    if (action === 'MARK_ABSENT') {
      const ok = await confirm({
        title: `${item.name} 학생을 결석 처리할까요?`,
        message: '오늘 출결이 결석으로 기록돼요. 나중에 입실 처리하면 바뀌어요.',
        confirmText: '결석 처리',
        destructive: true,
      });
      if (!ok) return false;
    }
    setBusy(action);
    try {
      await patchAttendance(item.id, { action });
      toast(`${item.name} ${ACTION_DONE[action] ?? '저장했어요'}`, 'success');
      onChanged?.();
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : '처리하지 못했어요', 'error');
      return false;
    } finally {
      setBusy(null);
    }
  };

  return { busy, run };
}

type ActionDef = { action: AttendanceAction; label: string; variant: 'primary' | 'weak' | 'dark' | 'gray' };

/** 지금 상태에서 할 수 있는 전환 (왼쪽 보조 → 오른쪽 주 행동) */
export function attendanceActionsFor(status: OpsAttendanceItem['status']): ActionDef[] {
  switch (status) {
    case '미입실':
      return [
        { action: 'MARK_ABSENT', label: '결석 처리', variant: 'gray' },
        { action: 'CHECK_IN', label: '입실', variant: 'primary' },
      ];
    case '결석':
      return [{ action: 'CHECK_IN', label: '입실', variant: 'primary' }];
    case '입실':
      return [
        { action: 'START_OUTING', label: '외출', variant: 'weak' },
        { action: 'CHECK_OUT', label: '퇴실', variant: 'dark' },
      ];
    case '외출':
      return [
        { action: 'CHECK_OUT', label: '퇴실', variant: 'weak' },
        { action: 'RETURN', label: '복귀', variant: 'primary' },
      ];
    default:
      return [];
  }
}

/** 상태 전환 버튼 줄 — 버튼들이 폭을 나눠 가진다 */
export function AttendanceActionButtons({
  item,
  onChanged,
  onDone,
  size = 'lg',
}: {
  item: OpsAttendanceItem;
  onChanged?: () => void;
  /** 성공 직후 (시트 닫기 등) */
  onDone?: () => void;
  size?: 'lg' | 'md';
}) {
  const { busy, run } = useAttendanceAction(item, onChanged);
  const actions = attendanceActionsFor(item.status);
  if (actions.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row', gap: space.x2 }}>
      {actions.map((a) => (
        <View key={a.action} style={{ flex: 1 }}>
          <Button
            block
            size={size}
            variant={a.variant}
            loading={busy === a.action}
            disabled={busy !== null && busy !== a.action}
            onPress={() => void run(a.action).then((ok) => ok && onDone?.())}>
            {a.label}
          </Button>
        </View>
      ))}
    </View>
  );
}

/** 폭을 나눠 갖는 시트 하단 버튼 한 칸 */
export function FooterSlot({ children }: { children: ReactNode }) {
  return <View style={{ flex: 1 }}>{children}</View>;
}

function NowSuffix({ onPress }: { onPress: () => void }) {
  return (
    <Press
      onPress={onPress}
      scale={0}
      pressedBg
      hitSlop={8}
      accessibilityLabel="지금 시각 넣기"
      style={{ paddingHorizontal: space.x1, paddingVertical: space.x1, borderRadius: 8 }}>
      <Text variant="t4-bold" color="brand">
        지금
      </Text>
    </Press>
  );
}

/**
 * 시트가 열릴 때마다 폼 값을 초기화 — 렌더 중 조건부 setState (React 권장 패턴).
 * key 가 바뀌거나(다른 학생·기록) 닫혔다 다시 열리면 init 을 한 번 부른다.
 */
export function useSheetSession(open: boolean, key: string | null, init: () => void) {
  const [session, setSession] = useState<string | null>(null);
  const next = open ? key : null;
  if (next !== session) {
    setSession(next);
    if (next !== null) init();
  }
}

// ─── 입실·퇴실 시각 / 출결 유형 / 비고 수정 (SET_TIMES) ─────────────────

export function TimesSheet({
  item,
  open,
  onClose,
  onSaved,
}: {
  item: OpsAttendanceItem | null;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [type, setType] = useState<AttendancePatch['type'] | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useSheetSession(open, item?.id ?? null, () => {
    setCheckIn(item?.checkIn ?? '');
    setCheckOut(item?.checkOut ?? '');
    setType(item?.attendanceType && item.attendanceType !== 'EARLY_LEAVE' ? item.attendanceType : null);
    setNotes(item?.note ?? '');
    setError(null);
  });

  const inErr = checkIn && !isValidTime(checkIn) ? '09:30 처럼 입력해 주세요' : null;
  const outErr = checkOut && !isValidTime(checkOut) ? '22:00 처럼 입력해 주세요' : null;

  const save = async () => {
    if (saving || !item) return;
    if (inErr || outErr) {
      setError('시간 형식을 확인해 주세요');
      return;
    }
    if (checkIn && checkOut && checkOut < checkIn) {
      setError('퇴실 시각이 입실보다 빨라요');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await patchAttendance(item.id, {
        action: 'SET_TIMES',
        checkIn: checkIn.trim() || null,
        checkOut: checkOut.trim() || null,
        ...(type ? { type } : {}),
        notes: notes.trim() || null,
      });
      toast('출결을 저장했어요', 'success');
      onSaved?.();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : '저장하지 못했어요', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      open={open && !!item}
      onClose={onClose}
      title="출결 직접 수정"
      description={item ? `${item.name} · 오늘` : undefined}
      footer={
        <>
          <FooterSlot>
            <Button variant="gray" block onPress={onClose} disabled={saving}>
              취소
            </Button>
          </FooterSlot>
          <FooterSlot>
            <Button block loading={saving} onPress={() => void save()}>
              저장
            </Button>
          </FooterSlot>
        </>
      }>
      <View style={{ flexDirection: 'row', gap: space.x2 }}>
        <View style={{ flex: 1 }}>
          <TextField
            label="입실"
            value={checkIn}
            onChangeText={(v) => setCheckIn(maskTime(v))}
            placeholder="09:30"
            keyboardType="number-pad"
            maxLength={5}
            errorMessage={inErr}
            suffix={<NowSuffix onPress={() => setCheckIn(nowKstTime())} />}
          />
        </View>
        <View style={{ flex: 1 }}>
          <TextField
            label="퇴실"
            value={checkOut}
            onChangeText={(v) => setCheckOut(maskTime(v))}
            placeholder="22:00"
            keyboardType="number-pad"
            maxLength={5}
            errorMessage={outErr}
            suffix={<NowSuffix onPress={() => setCheckOut(nowKstTime())} />}
          />
        </View>
      </View>
      <Text variant="t3-regular" color="neutralSubtle">
        비워 두면 그 기록을 지워요.
      </Text>

      <View style={{ gap: space.x2, paddingTop: space.x1 }}>
        <Text variant="t5-medium">출결 유형</Text>
        <ChipGroup>
          {ATTENDANCE_TYPE_OPTIONS.map((o) => (
            <Chip key={o.value} selected={type === o.value} onPress={() => setType(o.value)}>
              {o.label}
            </Chip>
          ))}
        </ChipGroup>
      </View>

      <View style={{ paddingTop: space.x1 }}>
        <TextField
          label="비고"
          indicator="선택"
          value={notes}
          onChangeText={setNotes}
          placeholder="특이사항을 적어 주세요"
          maxLength={500}
        />
      </View>

      {error && (
        <Text variant="t4-regular" color="critical">
          {error}
        </Text>
      )}
    </BottomSheet>
  );
}

// ─── 외출 추가 · 수정 · 삭제 ──────────────────────────────────────────

export function OutingSheet({
  item,
  outing,
  open,
  onClose,
  onSaved,
}: {
  item: OpsAttendanceItem | null;
  /** 수정할 외출 (id 있는 기록). 없으면 새로 추가 */
  outing: MobileOuting | null;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const editing = !!outing?.id;
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);

  useSheetSession(open, item ? `${item.id}:${outing?.id ?? 'new'}` : null, () => {
    // 정기 외출 예정(id 없음)을 눌렀으면 그 시간으로 채워서 새로 추가
    setStart(outing?.start ?? '');
    setEnd(outing?.end ?? '');
    setReason(outing?.reason ?? '');
  });

  const startErr = start && !isValidTime(start) ? '14:00 처럼 입력해 주세요' : null;
  const endErr = end && !isValidTime(end) ? '15:30 처럼 입력해 주세요' : null;

  const save = async () => {
    if (busy || !item) return;
    if (!start) {
      toast('나간 시각을 입력해 주세요', 'error');
      return;
    }
    if (startErr || endErr) {
      toast('시간 형식을 확인해 주세요', 'error');
      return;
    }
    if (end && end < start) {
      toast('복귀 시각이 나간 시각보다 빨라요', 'error');
      return;
    }
    setBusy('save');
    try {
      await patchAttendance(item.id, {
        action: editing ? 'EDIT_OUTING' : 'ADD_OUTING',
        ...(editing && outing?.id ? { outingId: outing.id } : {}),
        outStart: start,
        outEnd: end || null,
        reason: reason.trim() || null,
      });
      toast(editing ? '외출 기록을 고쳤어요' : '외출을 추가했어요', 'success');
      onSaved?.();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : '저장하지 못했어요', 'error');
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (busy || !item || !outing?.id) return;
    const ok = await confirm({
      title: '이 외출 기록을 지울까요?',
      message: `${outing.start ?? '—'}${outing.end ? ` ~ ${outing.end}` : ''}${outing.reason ? ` · ${outing.reason}` : ''}`,
      confirmText: '삭제',
      destructive: true,
    });
    if (!ok) return;
    setBusy('delete');
    try {
      await patchAttendance(item.id, { action: 'DELETE_OUTING', outingId: outing.id });
      toast('외출 기록을 지웠어요', 'success');
      onSaved?.();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : '삭제하지 못했어요', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <BottomSheet
      open={open && !!item}
      onClose={onClose}
      title={editing ? '외출 기록 수정' : '외출 추가'}
      description={item ? `${item.name} · 오늘` : undefined}
      footer={
        <>
          <FooterSlot>
            {editing ? (
              <Button
                variant="gray"
                block
                loading={busy === 'delete'}
                disabled={busy === 'save'}
                onPress={() => void remove()}>
                삭제
              </Button>
            ) : (
              <Button variant="gray" block onPress={onClose} disabled={!!busy}>
                취소
              </Button>
            )}
          </FooterSlot>
          <FooterSlot>
            <Button block loading={busy === 'save'} disabled={busy === 'delete'} onPress={() => void save()}>
              {editing ? '저장' : '추가'}
            </Button>
          </FooterSlot>
        </>
      }>
      <View style={{ flexDirection: 'row', gap: space.x2 }}>
        <View style={{ flex: 1 }}>
          <TextField
            label="나간 시각"
            value={start}
            onChangeText={(v) => setStart(maskTime(v))}
            placeholder="14:00"
            keyboardType="number-pad"
            maxLength={5}
            errorMessage={startErr}
            suffix={<NowSuffix onPress={() => setStart(nowKstTime())} />}
          />
        </View>
        <View style={{ flex: 1 }}>
          <TextField
            label="복귀"
            indicator="선택"
            value={end}
            onChangeText={(v) => setEnd(maskTime(v))}
            placeholder="15:30"
            keyboardType="number-pad"
            maxLength={5}
            errorMessage={endErr}
            suffix={<NowSuffix onPress={() => setEnd(nowKstTime())} />}
          />
        </View>
      </View>
      <View style={{ paddingTop: space.x1 }}>
        <TextField
          label="사유"
          indicator="선택"
          value={reason}
          onChangeText={setReason}
          placeholder="예: 수학학원, 병원"
          maxLength={200}
        />
      </View>
    </BottomSheet>
  );
}
