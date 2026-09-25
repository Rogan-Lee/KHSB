import { Clock } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { BottomSheet, Button, color, Press, radius, space, Text } from '@/design';

// SEED 시간 선택 — 웹 포털 PortalTimeField(outline·large 입력 + 시/분 선택 패널)와 같은 역할.
// 누르면 바텀시트에서 시(0–23)·분(5분 단위) 칩을 골라 24시간 HH:MM 으로 확정한다.

const pad = (n: number) => String(n).padStart(2, '0');
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTE_STEPS = Array.from({ length: 12 }, (_, i) => i * 5);

function parse(value: string): { h: number; m: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return { h: 9, m: 0 };
  return { h: Math.min(23, Number(m[1])), m: Math.min(59, Number(m[2])) };
}

export function TimeField({
  value,
  onChange,
  label,
  disabled = false,
  invalid = false,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  /** 시트 제목·접근성 이름 (예: "등원 시간") */
  label: string;
  disabled?: boolean;
  invalid?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => parse(value));

  const openSheet = () => {
    setDraft(parse(value));
    setOpen(true);
  };

  const minutes = useMemo(
    () =>
      MINUTE_STEPS.includes(draft.m)
        ? MINUTE_STEPS
        : [...MINUTE_STEPS, draft.m].sort((a, b) => a - b),
    [draft.m],
  );

  return (
    <>
      <Press
        onPress={openSheet}
        disabled={disabled}
        scale={0}
        accessibilityRole="button"
        accessibilityLabel={`${label} ${value || '미정'}`}
        accessibilityHint="눌러서 시간을 바꿀 수 있어요"
        style={[
          s.field,
          {
            borderColor: invalid ? color.stroke.criticalSolid : color.stroke.neutralWeak,
            borderWidth: invalid ? 2 : 1,
            backgroundColor: disabled ? color.bg.disabled : color.bg.layerDefault,
          },
          style,
        ]}>
        <Text
          variant="t5-regular"
          color={disabled ? 'disabled' : value ? 'neutral' : 'placeholder'}
          tabular
          numberOfLines={1}>
          {value || '--:--'}
        </Text>
      </Press>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        footer={
          <>
            <Button variant="gray" size="xl" style={{ flex: 1 }} onPress={() => setOpen(false)}>
              취소
            </Button>
            <Button
              variant="primary"
              size="xl"
              style={{ flex: 1 }}
              onPress={() => {
                onChange(`${pad(draft.h)}:${pad(draft.m)}`);
                setOpen(false);
              }}>
              확인
            </Button>
          </>
        }>
        <View style={s.preview} accessibilityLiveRegion="polite">
          <Clock color={color.fg.neutralSubtle} size={22} strokeWidth={2.2} />
          <Text variant="t12-bold" tabular>
            {pad(draft.h)}:{pad(draft.m)}
          </Text>
        </View>

        <Text variant="t4-bold" color="neutralMuted">
          시
        </Text>
        <CellGrid
          items={HOURS}
          selected={draft.h}
          label={(h) => `${h}시`}
          onSelect={(h) => setDraft((d) => ({ ...d, h }))}
        />

        <Text variant="t4-bold" color="neutralMuted" style={{ marginTop: space.x2 }}>
          분
        </Text>
        <CellGrid
          items={minutes}
          selected={draft.m}
          label={(m) => `${pad(m)}분`}
          onSelect={(m) => setDraft((d) => ({ ...d, m }))}
        />
      </BottomSheet>
    </>
  );
}

function CellGrid({
  items,
  selected,
  label,
  onSelect,
}: {
  items: number[];
  selected: number;
  label: (v: number) => string;
  onSelect: (v: number) => void;
}) {
  return (
    <View style={s.grid} accessibilityRole="radiogroup">
      {items.map((v) => {
        const on = v === selected;
        return (
          <View key={v} style={s.cellWrap}>
            <Press
              onPress={() => onSelect(v)}
              scale={0.94}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={label(v)}
              style={[s.cell, { backgroundColor: on ? color.bg.neutralInverted : color.bg.neutralWeak }]}>
              <Text variant={on ? 't4-bold' : 't4-medium'} color={on ? 'neutralInverted' : 'neutral'} tabular>
                {label(v)}
              </Text>
            </Press>
          </View>
        );
      })}
    </View>
  );
}

/** 시작 ~ 끝 시간 두 칸 */
export function TimeRange({
  start,
  end,
  startLabel,
  endLabel,
  disabled,
  invalid,
  onStart,
  onEnd,
}: {
  start: string;
  end: string;
  startLabel: string;
  endLabel: string;
  disabled?: boolean;
  invalid?: boolean;
  onStart: (v: string) => void;
  onEnd: (v: string) => void;
}) {
  return (
    <View style={s.range}>
      <TimeField value={start} label={startLabel} disabled={disabled} onChange={onStart} style={{ flex: 1 }} />
      <Text variant="t5-regular" color="neutralSubtle" accessibilityElementsHidden importantForAccessibility="no">
        ~
      </Text>
      <TimeField
        value={end}
        label={endLabel}
        disabled={disabled}
        invalid={invalid}
        onChange={onEnd}
        style={{ flex: 1 }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  field: {
    minHeight: 52,
    minWidth: 0,
    borderRadius: radius.r3,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.x3,
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.x2,
    paddingVertical: space.x2,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3 },
  cellWrap: { width: '16.6667%', padding: 3 },
  cell: {
    minHeight: 44,
    borderRadius: radius.r2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  range: { flexDirection: 'row', alignItems: 'center', gap: space.x2 },
});
