import { Check, ChevronDown, Clock, Lock, Utensils } from 'lucide-react-native';
import { Fragment, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  color,
  confirm,
  Divider,
  EmptyState,
  Notice,
  Press,
  space,
  Text,
  TextField,
  toast,
} from '@/design';

import type { LunchAdapter, LunchData, LunchMenu } from './adapter';
import { LunchFrame } from './frame';
import {
  daysBetween,
  deadlineOf,
  dowLabel,
  kstTodayKey,
  mdLabel,
  weekStartOf,
  won,
  ymdLabel,
} from './format';

/**
 * 도시락 신청 — 신청할 수 있는 주를 한 화면에 모두 펼쳐 두고, 주마다 "모두 선택" 한 번으로 고른다.
 * 웹 OrderView 와 같은 규칙: 결제 완료·마감(잠긴 주) 날짜는 선택 불가, 선택을 비우고 저장하면 신청 취소.
 */
export function LunchOrderView({
  adapter,
  data,
  refreshing,
  onRefresh,
  onSaved,
  onBack,
}: {
  adapter: LunchAdapter;
  data: LunchData;
  refreshing: boolean;
  onRefresh: () => void;
  onSaved: () => void;
  /** 입금 안내·확정 화면에서 수정하러 들어왔을 때 — 헤더 뒤로가기가 이전 화면으로 */
  onBack?: () => void;
}) {
  const { menus, paidMenuIds, pendingMenuIds } = data;
  const paidSet = useMemo(() => new Set(paidMenuIds), [paidMenuIds]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(pendingMenuIds));
  const [memo, setMemo] = useState(data.pendingMemo);
  const [memoOpen, setMemoOpen] = useState(!!data.pendingMemo);
  const [busy, setBusy] = useState(false);
  const today = kstTodayKey();

  // 주 단위로 묶기 — 신청 가능한 날이 하나라도 있는 주만 펼치고, 전부 마감된 주는 아래 한 줄 안내로
  const weeks = useMemo(() => {
    const map = new Map<string, LunchMenu[]>();
    for (const m of [...menus].sort((a, b) => a.date.localeCompare(b.date))) {
      const w = weekStartOf(m.date);
      map.set(w, [...(map.get(w) ?? []), m]);
    }
    return [...map.entries()].map(([monday, items]) => ({
      monday,
      items,
      selectable: items.filter((m) => !m.locked && !paidSet.has(m.id)),
      hasPaid: items.some((m) => paidSet.has(m.id)),
    }));
  }, [menus, paidSet]);
  const openWeeks = weeks.filter((w) => w.selectable.length > 0 || w.hasPaid);
  const closedWeeks = weeks.filter((w) => w.selectable.length === 0 && !w.hasPaid);
  const allSelectable = openWeeks.flatMap((w) => w.selectable);

  const selectedMenus = menus.filter((m) => selected.has(m.id));
  const total = selectedMenus.reduce((sum, m) => sum + m.price, 0);
  const hadPending = pendingMenuIds.length > 0;
  const prices = [...new Set(allSelectable.map((m) => m.price))];

  const nextDeadline = openWeeks.find((w) => w.selectable.length > 0);
  const deadlineYmd = nextDeadline ? deadlineOf(nextDeadline.monday) : null;
  const dDay = deadlineYmd ? daysBetween(today, deadlineYmd) : null;

  const toggle = (m: LunchMenu) => {
    if (paidSet.has(m.id) || m.locked) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(m.id)) next.delete(m.id);
      else next.add(m.id);
      return next;
    });
  };
  const setMany = (items: LunchMenu[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const m of items) {
        if (on) next.add(m.id);
        else next.delete(m.id);
      }
      return next;
    });

  const submit = async () => {
    if (busy) return;
    if (selected.size === 0) {
      const ok = await confirm({
        title: '도시락 신청을 취소할까요?',
        message: '입금 전인 신청 내역이 모두 지워져요.',
        confirmText: '신청 취소',
        cancelText: '닫기',
        destructive: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await adapter.saveOrder([...selected], memo);
      toast(res.count === 0 ? '신청을 취소했어요' : `${res.count}일 신청했어요`, 'success');
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : '신청하지 못했어요', 'error');
    } finally {
      setBusy(false);
    }
  };

  const footer =
    openWeeks.length === 0 ? undefined : selected.size > 0 ? (
      <View style={{ gap: space.x2_5 }}>
        <View style={s.sumLine}>
          <Text variant="t4-medium" color="neutralMuted" tabular>
            {selected.size}일 선택
          </Text>
          <Text variant="t6-bold" tabular>
            {won(total)}
          </Text>
        </View>
        <Button variant="primary" size="xl" block loading={busy} onPress={submit}>
          {hadPending ? '신청 내용 저장하기' : '신청하기'}
        </Button>
      </View>
    ) : hadPending ? (
      <Button variant="gray" size="xl" block loading={busy} onPress={submit}>
        신청 취소하기
      </Button>
    ) : (
      <Button variant="primary" size="xl" block disabled>
        먹을 날짜를 골라 주세요
      </Button>
    );

  const meta = [
    adapter.audience === 'parent' ? `${data.studentName} 학생` : null,
    prices.length === 1 ? `1끼 ${won(prices[0])}` : null,
    '입금이 확인되면 확정돼요',
  ].filter(Boolean);

  return (
    <LunchFrame
      frame={adapter}
      surface="panel"
      footer={footer}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onBack={onBack}>
      <View style={{ gap: space.x1_5, paddingTop: space.x2 }}>
        <Text variant="t9-bold">먹을 날짜를 골라 주세요</Text>
        <Text variant="t4-regular" color="neutralSubtle">
          {meta.join(' · ')}
        </Text>
      </View>

      {openWeeks.length === 0 ? (
        <EmptyState
          icon={Utensils}
          title="아직 신청할 수 있는 메뉴가 없어요"
          description="메뉴가 등록되면 여기에서 신청할 수 있어요."
          style={{ paddingVertical: space.x10 }}
        />
      ) : (
        <>
          {deadlineYmd != null && dDay != null && (
            <Notice tone={dDay <= 1 ? 'warn' : 'info'} icon={Clock} title={dDay <= 0 ? '오늘 마감' : `D-${dDay}`}>
              {`${ymdLabel(deadlineYmd)} 밤 11시 59분까지 신청할 수 있어요`}
            </Notice>
          )}

          {openWeeks.length > 1 && allSelectable.length > 0 && (
            <View style={s.allRow}>
              <Text variant="t4-regular" color="neutralSubtle">
                신청할 수 있는 날 {allSelectable.length}일
              </Text>
              <Button
                variant="weak"
                size="sm"
                onPress={() => setMany(allSelectable, !allSelectable.every((m) => selected.has(m.id)))}>
                {allSelectable.every((m) => selected.has(m.id)) ? '전체 해제' : '전체 선택'}
              </Button>
            </View>
          )}

          {openWeeks.map((w, wi) => {
            const allOn = w.selectable.length > 0 && w.selectable.every((m) => selected.has(m.id));
            const last = w.items[w.items.length - 1].date;
            return (
              <Fragment key={w.monday}>
                {wi > 0 && <View style={s.weekGap} />}
                <View style={{ gap: space.x2 }}>
                  <View style={s.weekHead}>
                    <View style={{ flex: 1, minWidth: 0, gap: space.x0_5 }}>
                      <Text variant="t6-bold">{`${ymdLabel(w.monday, false)} 주`}</Text>
                      <Text variant="t3-regular" color="neutralSubtle" tabular>
                        {`${mdLabel(w.items[0].date)}–${mdLabel(last)}`}
                        {w.selectable.length > 0 ? ` · ${ymdLabel(deadlineOf(w.monday))} 마감` : ' · 신청 마감'}
                      </Text>
                    </View>
                    {w.selectable.length > 0 && (
                      <Button variant={allOn ? 'gray' : 'weak'} size="sm" onPress={() => setMany(w.selectable, !allOn)}>
                        {allOn ? '모두 해제' : '모두 선택'}
                      </Button>
                    )}
                  </View>
                  <View>
                    {w.items.map((m, i) => (
                      <Fragment key={m.id}>
                        {i > 0 && <Divider style={{ marginLeft: 38 }} />}
                        <DayRow
                          menu={m}
                          checked={selected.has(m.id)}
                          paid={paidSet.has(m.id)}
                          onToggle={() => toggle(m)}
                        />
                      </Fragment>
                    ))}
                  </View>
                </View>
              </Fragment>
            );
          })}

          {closedWeeks.length > 0 && (
            <View style={s.closed}>
              <Lock color={color.fg.neutralSubtle} size={14} strokeWidth={2.2} style={{ marginTop: 2 }} />
              <Text variant="t3-regular" color="neutralSubtle" style={{ flex: 1 }}>
                {closedWeeks.map((w) => `${mdLabel(w.items[0].date)}–${mdLabel(w.items[w.items.length - 1].date)}`).join(', ')}{' '}
                주는 신청이 마감됐어요. 바꾸려면 원장님께 문의해 주세요.
              </Text>
            </View>
          )}

          <View style={s.weekGap} />
          {memoOpen ? (
            <TextField
              label="요청사항"
              indicator="선택"
              value={memo}
              onChangeText={setMemo}
              placeholder="알레르기, 수령 관련 등"
              multiline
              minHeight={96}
              maxLength={300}
              showCount
              autoFocus={!data.pendingMemo}
            />
          ) : (
            <Press onPress={() => setMemoOpen(true)} scale={0} pressedBg style={s.memoRow}>
              <View style={{ flex: 1, gap: space.x0_5 }}>
                <Text variant="t5-medium">요청사항 남기기</Text>
                <Text variant="t4-regular" color="neutralSubtle">
                  알레르기나 수령 관련 요청이 있으면 알려 주세요
                </Text>
              </View>
              <ChevronDown color={color.fg.neutralSubtle} size={20} strokeWidth={2} />
            </Press>
          )}
        </>
      )}
    </LunchFrame>
  );
}

/** 날짜 한 줄 — 체크 · 날짜/메뉴 · 가격. 결제 완료는 비활성 */
function DayRow({
  menu,
  checked,
  paid,
  onToggle,
}: {
  menu: LunchMenu;
  checked: boolean;
  paid: boolean;
  onToggle: () => void;
}) {
  const disabled = paid || menu.locked;
  const on = checked && !paid;
  return (
    <Press
      onPress={onToggle}
      disabled={disabled}
      scale={0}
      pressedBg
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on || paid, disabled }}
      accessibilityLabel={`${ymdLabel(menu.date)}, ${menu.name}, ${won(menu.price)}${paid ? ', 결제 완료' : menu.locked ? ', 마감' : ''}`}
      style={s.row}>
      <View
        style={[
          s.check,
          on && { backgroundColor: color.bg.brandSolid, borderColor: color.bg.brandSolid },
          paid && { backgroundColor: color.bg.positiveWeak, borderColor: color.stroke.positiveWeak },
        ]}>
        {on && <Check color={color.palette.staticWhite} size={16} strokeWidth={3} />}
        {paid && <Check color={color.fg.positive} size={16} strokeWidth={3} />}
        {menu.locked && !paid && <Lock color={color.fg.disabled} size={12} strokeWidth={2.4} />}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: space.x0_5 }}>
        <Text variant="t5-medium" color={disabled && !paid ? 'neutralSubtle' : 'neutral'}>
          {`${mdLabel(menu.date)} (${dowLabel(menu.date)})`}
        </Text>
        <Text variant="t4-regular" color="neutralSubtle" numberOfLines={1}>
          {menu.name}
        </Text>
      </View>
      {paid ? (
        <Badge tone="ok">결제 완료</Badge>
      ) : (
        <Text variant="t5-medium" color={on ? 'neutral' : 'neutralSubtle'} tabular>
          {won(menu.price)}
        </Text>
      )}
    </Press>
  );
}

const s = StyleSheet.create({
  allRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weekHead: { flexDirection: 'row', alignItems: 'center', gap: space.x3 },
  weekGap: { height: 8, marginHorizontal: -space.x4, backgroundColor: color.bg.layerBasement },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    minHeight: 60,
    paddingVertical: space.x2_5,
    paddingHorizontal: space.x1,
    marginHorizontal: -space.x1,
    borderRadius: 12,
  },
  check: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: color.stroke.neutralWeak,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closed: { flexDirection: 'row', gap: space.x1_5, paddingTop: space.x1 },
  memoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    minHeight: 56,
    paddingVertical: space.x2,
    paddingHorizontal: space.x1,
    marginHorizontal: -space.x1,
    borderRadius: 12,
  },
  sumLine: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: space.x1 },
});
