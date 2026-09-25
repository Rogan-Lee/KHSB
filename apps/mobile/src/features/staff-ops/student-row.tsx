import { memo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge, Button, color, ListRow, radius, space, Text, toast } from '@/design';
import { patchAttendance, type AttendanceAction, type OpsAttendanceItem } from '@/lib/api/staff-ops';

import { attendanceLine, SEAT_FILL, STATUS_LABEL, STATUS_TONE } from './status';

/** 좌석 번호 타일 — 오늘 상태 색 + 늦음(빨간 점) */
export function SeatTile({
  seat,
  status,
  late = false,
  size = 44,
}: {
  seat: string | null;
  status: OpsAttendanceItem['status'];
  late?: boolean;
  size?: number;
}) {
  const fill = SEAT_FILL[status];
  return (
    <View style={[s.tile, { width: size, height: size, backgroundColor: fill.bg, borderColor: fill.border }]}>
      <Text
        variant={seat && seat.length > 2 ? 't3-bold' : 't5-bold'}
        color={fill.fg}
        tabular
        numberOfLines={1}>
        {seat?.trim() || '–'}
      </Text>
      {late && <View style={s.dot} />}
    </View>
  );
}

/** 이름 옆 표시 — 지각·유의·학부모 요청 */
export function StudentFlags({ item, compact = false }: { item: OpsAttendanceItem; compact?: boolean }) {
  return (
    <>
      {item.isLate && <Badge tone="bad">지각</Badge>}
      {item.attention && <Badge tone="warn">유의</Badge>}
      {item.unreadRequests > 0 && (
        <Badge tone="brand">
          {compact ? `요청 ${item.unreadRequests}` : `학부모 요청 ${item.unreadRequests}`}
        </Badge>
      )}
    </>
  );
}

const QUICK: Partial<
  Record<OpsAttendanceItem['status'], { action: AttendanceAction; label: string; done: string }>
> = {
  미입실: { action: 'CHECK_IN', label: '입실', done: '입실 처리했어요' },
  외출: { action: 'RETURN', label: '복귀', done: '복귀 처리했어요' },
};

/**
 * 입퇴실 목록 한 줄 — 좌석 타일 · 이름+표시 · 시간 · 상태(또는 바로 입실/복귀 버튼).
 * quickAction 이면 미입실→입실, 외출→복귀를 줄에서 바로 처리한다.
 */
export const StudentRow = memo(function StudentRow({
  item,
  onPress,
  quickAction = false,
  onChanged,
  selected = false,
}: {
  item: OpsAttendanceItem;
  onPress: (item: OpsAttendanceItem) => void;
  quickAction?: boolean;
  onChanged?: () => void;
  selected?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const quick = quickAction ? QUICK[item.status] : undefined;

  const runQuick = async () => {
    if (!quick || busy) return;
    setBusy(true);
    try {
      await patchAttendance(item.id, { action: quick.action });
      toast(`${item.name} ${quick.done}`, 'success');
      onChanged?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : '처리하지 못했어요', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ListRow
      onPress={() => onPress(item)}
      chevron={false}
      style={selected ? { backgroundColor: color.bg.neutralWeak } : undefined}
      leading={<SeatTile seat={item.seat} status={item.status} late={item.isLate} />}
      title={
        <View style={s.titleRow}>
          <Text variant="t5-medium" numberOfLines={1} style={{ flexShrink: 1 }}>
            {item.name}
          </Text>
          <Text variant="t3-regular" color="neutralSubtle" numberOfLines={1}>
            {item.grade}
          </Text>
          <StudentFlags item={item} compact />
        </View>
      }
      description={
        <Text variant="t4-regular" color="neutralSubtle" numberOfLines={1} tabular>
          {attendanceLine(item)}
        </Text>
      }
      trailing={
        quick ? (
          <Button
            variant={item.status === '외출' ? 'primary' : 'weak'}
            size="sm"
            loading={busy}
            onPress={() => void runQuick()}
            accessibilityLabel={`${item.name} ${quick.label} 처리`}>
            {quick.label}
          </Button>
        ) : (
          <Badge tone={STATUS_TONE[item.status]} size="md">
            {STATUS_LABEL[item.status]}
          </Badge>
        )
      }
    />
  );
});

const s = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.r3,
    borderWidth: 1,
  },
  dot: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: color.bg.criticalSolid,
    borderWidth: 2,
    borderColor: color.bg.layerDefault,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.x1_5 },
});
