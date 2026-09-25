import { useFocusEffect } from 'expo-router';
import { Fragment, memo, useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  color,
  ErrorState,
  GroupLabel,
  Press,
  radius,
  Screen,
  Section,
  Segmented,
  Skeleton,
  space,
  Stack,
  StatGrid,
  Text,
  toast,
} from '@/design';
import { OfflineOpsLocked, useOfflineOpsAllowed } from '@/features/staff-ops/access';
import { SEAT_FILL } from '@/features/staff-ops/status';
import { StudentQuickSheet } from '@/features/staff-ops/student-quick-sheet';
import { StudentRow } from '@/features/staff-ops/student-row';
import type { OpsAttendanceItem, SeatLayoutCell, SeatLayoutRoom, SeatMapResponse } from '@/lib/api/staff-ops';
import { useMobileQuery } from '@/lib/mobile-api';
import { useResponsive } from '@/lib/responsive';

const SEAT_H = 44;
const COL_GAP = 4;
const AISLE = 12;

/** 좌석 현황 — 웹 배치도와 같은 K·H룸 배치에 오늘 입퇴실 상태를 색으로 */
export default function StaffSeatMapScreen() {
  const allowed = useOfflineOpsAllowed();
  if (!allowed) return <OfflineOpsLocked title="좌석 현황" />;
  return <SeatMapBoard />;
}

function SeatMapBoard() {
  const { isTablet } = useResponsive();
  const { data, error, isLoading, isRefreshing, refresh, retry } = useMobileQuery<SeatMapResponse>(
    '/api/mobile/v1/staff/seat-map'
  );
  const [roomKey, setRoomKey] = useState<'K' | 'H'>('K');
  const [sheet, setSheet] = useState<{ id: string; open: boolean } | null>(null);

  useFocusEffect(
    useCallback(() => {
      const t = setInterval(() => void retry(), 60_000);
      return () => clearInterval(t);
    }, [retry])
  );

  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const bySeat = useMemo(() => {
    const m = new Map<string, OpsAttendanceItem>();
    items.forEach((i) => i.seat?.trim() && m.set(i.seat.trim(), i));
    return m;
  }, [items]);

  const roomSeats = useMemo(() => {
    const out: Record<string, Set<string>> = {};
    (data?.rooms ?? []).forEach((r) => {
      const set = new Set<string>();
      r.blocks.flat(2).forEach((n) => n !== null && set.add(String(n)));
      r.bottom.forEach((b) => b.kind === 'seat' && set.add(String(b.seat)));
      out[r.key] = set;
    });
    return out;
  }, [data?.rooms]);

  const room = data?.rooms.find((r) => r.key === roomKey) ?? data?.rooms[0];
  const inRoom = room ? items.filter((i) => i.seat && roomSeats[room.key]?.has(i.seat.trim())) : [];
  const count = (st: OpsAttendanceItem['status']) => inRoom.filter((i) => i.status === st).length;
  const lateCount = inRoom.filter((i) => i.isLate).length;
  const elsewhere = items.filter(
    (i) => !i.seat?.trim() || !Object.values(roomSeats).some((set) => set.has(i.seat!.trim()))
  );

  const onSeat = useCallback(
    (n: number) => {
      const item = bySeat.get(String(n));
      if (item) setSheet({ id: item.id, open: true });
      else toast(`${n}번은 빈 좌석이에요`);
    },
    [bySeat]
  );

  const sheetItem = sheet ? (items.find((i) => i.id === sheet.id) ?? null) : null;

  return (
    <Screen
      kind="push"
      title="좌석 현황"
      backFallback="/(staff)/(tabs)"
      maxWidth={isTablet ? 900 : undefined}
      refreshing={isRefreshing}
      onRefresh={() => void refresh()}>
      {isLoading && !data ? (
        <MapSkeleton />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={() => void retry()} />
      ) : data && room ? (
        <Stack>
          <Segmented
            options={data.rooms.map((r) => ({
              value: r.key,
              label: `${r.label} ${items.filter((i) => i.seat && roomSeats[r.key]?.has(i.seat.trim())).length}명`,
            }))}
            value={room.key}
            onChange={setRoomKey}
          />

          <Section>
            <StatGrid
              surface="plain"
              items={[
                { label: '재실', value: count('입실'), tone: 'positive' },
                { label: '외출', value: count('외출'), tone: count('외출') ? 'warning' : 'neutral' },
                {
                  label: '미입실',
                  value: count('미입실'),
                  sub: lateCount ? `지각 ${lateCount}` : count('결석') ? `결석 ${count('결석')}` : undefined,
                  tone: lateCount ? 'critical' : 'neutral',
                },
                { label: '퇴실', value: count('퇴실') },
              ]}
            />
          </Section>

          <Section>
            <RoomMap room={room} bySeat={bySeat} onSeat={onSeat} />
            <Legend />
          </Section>

          {elsewhere.length > 0 && (
            <View>
              <GroupLabel trailing={`${elsewhere.length}명`}>배치도에 없는 좌석</GroupLabel>
              <Section flush>
                {elsewhere.map((i) => (
                  <StudentRow key={i.id} item={i} onPress={() => setSheet({ id: i.id, open: true })} />
                ))}
              </Section>
            </View>
          )}
        </Stack>
      ) : null}

      <StudentQuickSheet
        item={sheetItem}
        open={!!sheet?.open}
        onClose={() => setSheet((cur) => (cur ? { ...cur, open: false } : cur))}
        onChanged={() => void retry()}
      />
    </Screen>
  );
}

type Child = { kind: 'col'; col: SeatLayoutCell[]; index: number } | { kind: 'aisle' };

function RoomMap({
  room,
  bySeat,
  onSeat,
}: {
  room: SeatLayoutRoom;
  bySeat: Map<string, OpsAttendanceItem>;
  onSeat: (n: number) => void;
}) {
  const children: Child[] = [];
  let index = 0;
  room.blocks.forEach((block, bi) => {
    if (bi > 0) children.push({ kind: 'aisle' });
    block.forEach((col) => children.push({ kind: 'col', col, index: index++ }));
  });
  const colCount = index;
  const rows = Math.max(...room.blocks.flat(1).map((c) => c.length));

  return (
    <View style={{ gap: space.x5 }}>
      <View style={[s.cols, { height: room.colHeight }]}>
        {children.map((c, i) =>
          c.kind === 'aisle' ? (
            <View key={`a${i}`} style={{ width: AISLE }} />
          ) : (
            <View key={`c${i}`} style={[s.col, { height: room.colHeight }]}>
              {c.col.map((n, ri) =>
                n === null ? (
                  <View key={`sp${ri}`} style={{ height: SEAT_H }} />
                ) : (
                  <SeatCell key={n} num={n} item={bySeat.get(String(n))} onSeat={onSeat} />
                )
              )}
            </View>
          )
        )}

        {room.overlay && (
          <View
            pointerEvents="none"
            style={[
              s.overlay,
              { top: Math.round((room.overlay.row * (room.colHeight - SEAT_H)) / Math.max(1, rows - 1)) },
            ]}>
            {children.map((c, i) => {
              if (c.kind === 'aisle') return <View key={`oa${i}`} style={{ width: AISLE }} />;
              const first = colCount - room.overlay!.span;
              if (c.index < first) return <View key={`oc${i}`} style={{ flex: 1 }} />;
              if (c.index > first) return null;
              return (
                <View key={`of${i}`} style={{ flex: room.overlay!.span }}>
                  <Facility label={room.overlay!.label} height={SEAT_H} />
                </View>
              );
            })}
          </View>
        )}
      </View>

      {room.bottom.length > 0 && (
        <View style={s.bottom}>
          {room.bottom.map((b, i) => (
            <Fragment key={i}>
              {b.kind === 'aisle' ? (
                <View style={{ width: AISLE }} />
              ) : b.kind === 'facility' ? (
                <View style={{ flex: b.flex, minWidth: 0 }}>
                  <Facility label={b.label} height={40} />
                </View>
              ) : (
                <View style={{ flex: 1, minWidth: 0 }}>
                  <SeatCell num={b.seat} item={bySeat.get(String(b.seat))} onSeat={onSeat} />
                </View>
              )}
            </Fragment>
          ))}
        </View>
      )}
    </View>
  );
}

const SeatCell = memo(function SeatCell({
  num,
  item,
  onSeat,
}: {
  num: number;
  item: OpsAttendanceItem | undefined;
  onSeat: (n: number) => void;
}) {
  const fill = item ? SEAT_FILL[item.status] : null;
  return (
    <Press
      onPress={() => onSeat(num)}
      scale={0.94}
      accessibilityLabel={item ? `${num}번 ${item.name} ${item.status}` : `${num}번 빈 좌석`}
      style={[
        s.seat,
        fill
          ? { backgroundColor: fill.bg, borderColor: fill.border }
          : { backgroundColor: 'transparent', borderColor: color.stroke.neutralWeak, borderStyle: 'dashed' },
      ]}>
      <Text variant="t1-bold" color={fill ? fill.fg : 'placeholder'} tabular numberOfLines={1}>
        {num}
      </Text>
      <Text
        variant="t2-medium"
        color={
          !item
            ? 'placeholder'
            : item.status === '퇴실' || item.status === '미입실'
              ? 'neutralMuted'
              : 'neutral'
        }
        numberOfLines={1}
        style={{ maxWidth: '100%', paddingHorizontal: 2 }}>
        {item?.name ?? '–'}
      </Text>
      {item?.isLate && <View style={s.dot} />}
    </Press>
  );
});

function Facility({ label, height }: { label: string; height: number }) {
  return (
    <View style={[s.facility, { height }]}>
      <Text variant="t2-medium" color="neutralSubtle" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function Legend() {
  const items: { label: string; bg: string; border: string; dashed?: boolean }[] = [
    { label: '재실', ...SEAT_FILL['입실'] },
    { label: '외출', ...SEAT_FILL['외출'] },
    { label: '미입실', ...SEAT_FILL['미입실'] },
    { label: '결석', ...SEAT_FILL['결석'] },
    { label: '퇴실', ...SEAT_FILL['퇴실'] },
    { label: '빈 좌석', bg: 'transparent', border: color.stroke.neutralWeak, dashed: true },
  ];
  return (
    <View style={s.legend}>
      {items.map((l) => (
        <View key={l.label} style={s.legendItem}>
          <View
            style={[
              s.swatch,
              { backgroundColor: l.bg, borderColor: l.border, borderStyle: l.dashed ? 'dashed' : 'solid' },
            ]}
          />
          <Text variant="t3-regular" color="neutralMuted">
            {l.label}
          </Text>
        </View>
      ))}
      <View style={s.legendItem}>
        <View style={[s.dot, { position: 'relative', top: 0, right: 0 }]} />
        <Text variant="t3-regular" color="neutralMuted">
          지각
        </Text>
      </View>
    </View>
  );
}

function MapSkeleton() {
  return (
    <Stack>
      <Skeleton style={{ height: 42, borderRadius: radius.full }} />
      <Skeleton style={{ height: 84, borderRadius: radius.r5 }} />
      <View style={[s.skelCard, { flexDirection: 'row', gap: COL_GAP }]}>
        {[0, 1, 2, 3, 4, 5].map((c) => (
          <View key={c} style={{ flex: 1, gap: space.x3 }}>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((r) => (
              <Skeleton key={r} style={{ height: SEAT_H, borderRadius: radius.r2 }} />
            ))}
          </View>
        ))}
      </View>
    </Stack>
  );
}

const s = StyleSheet.create({
  cols: { flexDirection: 'row', gap: COL_GAP },
  col: { flex: 1, minWidth: 0, justifyContent: 'space-between' },
  seat: {
    height: SEAT_H,
    borderRadius: radius.r2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
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
  overlay: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', gap: COL_GAP },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: COL_GAP },
  facility: {
    borderRadius: radius.r2,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.stroke.neutralWeak,
    backgroundColor: color.bg.layerFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.x3, marginTop: space.x5 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.x1_5 },
  swatch: { width: 14, height: 14, borderRadius: 4, borderWidth: 1 },
  skelCard: { backgroundColor: color.bg.layerDefault, borderRadius: radius.r5, padding: space.x5 },
});
