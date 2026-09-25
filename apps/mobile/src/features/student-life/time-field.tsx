import { Clock } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { BottomSheet, Button, color, Press, radius, space, Text } from '@/design';

// 시간 입력 — 웹 포털 PortalTimeField(SEED TextField outline·large 모양 + 시/분 선택 패널)의 앱 버전.
// 필드를 누르면 바텀시트에서 시·분을 고른다. 항상 24시간 "HH:MM".

const ROW = 44;
const COLUMN_HEIGHT = ROW * 5;
const pad = (n: number) => String(n).padStart(2, '0');

function parse(value: string): { h: number; m: number } | null {
  const hit = /^(\d{2}):(\d{2})$/.exec(value);
  if (!hit) return null;
  return { h: Number(hit[1]), m: Number(hit[2]) };
}

export function TimeField({
  label,
  value,
  onChange,
  placeholder = '--:--',
  align = 'start',
  disabled = false,
  minuteStep = 1,
  initialDraft,
  sheetTitle,
}: {
  /** 시트 제목·접근성 라벨 (필드 위 라벨은 화면이 그린다) */
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  align?: 'start' | 'center';
  disabled?: boolean;
  /** 분 간격 (1 이면 0–59 전부) */
  minuteStep?: number;
  /** 값이 비어 있을 때 시트가 처음 가리킬 시각 "HH:MM" */
  initialDraft?: () => string;
  sheetTitle?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ h: number; m: number }>({ h: 0, m: 0 });

  const show = () => {
    const base = parse(value) ?? parse(initialDraft?.() ?? '') ?? { h: 12, m: 0 };
    // 분 간격에 맞춰 내림 (값이 간격 밖이면 가장 가까운 아래 칸)
    setDraft({ h: base.h, m: base.m - (base.m % minuteStep) });
    setOpen(true);
  };

  const empty = !value;
  return (
    <>
      <Press
        onPress={show}
        disabled={disabled}
        scale={0}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${empty ? '선택 안 함' : value}`}
        accessibilityState={{ disabled, expanded: open }}
        style={[
          s.box,
          open ? s.boxOpen : null,
          { backgroundColor: disabled ? color.bg.disabled : color.bg.layerDefault },
        ]}>
        <Text
          variant="t5-regular"
          tabular
          color={empty ? 'placeholder' : disabled ? 'disabled' : 'neutral'}
          numberOfLines={1}
          style={{ flex: 1, textAlign: align === 'center' ? 'center' : 'left' }}>
          {empty ? placeholder : value}
        </Text>
        <Clock color={color.fg.neutralSubtle} size={18} strokeWidth={2} />
      </Press>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={sheetTitle ?? label}
        footer={
          <Button
            variant="primary"
            size="xl"
            block
            style={{ flex: 1 }}
            onPress={() => {
              onChange(`${pad(draft.h)}:${pad(draft.m)}`);
              setOpen(false);
            }}>
            확인
          </Button>
        }>
        <Text variant="t10-bold" tabular align="center" accessibilityLiveRegion="polite">
          {pad(draft.h)}:{pad(draft.m)}
        </Text>
        <View style={s.columns}>
          <WheelColumn
            title="시"
            values={Array.from({ length: 24 }, (_, i) => i)}
            selected={draft.h}
            onSelect={(h) => setDraft((d) => ({ ...d, h }))}
          />
          <WheelColumn
            title="분"
            values={Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep)}
            selected={draft.m}
            onSelect={(m) => setDraft((d) => ({ ...d, m }))}
          />
        </View>
      </BottomSheet>
    </>
  );
}

function WheelColumn({
  title,
  values,
  selected,
  onSelect,
}: {
  title: string;
  values: number[];
  selected: number;
  onSelect: (v: number) => void;
}) {
  const ref = useRef<ScrollView>(null);
  const scrolled = useRef(false);

  return (
    <View style={{ flex: 1, gap: space.x1_5 }}>
      <Text variant="t3-medium" color="neutralSubtle" align="center">
        {title}
      </Text>
      <ScrollView
        ref={ref}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        style={s.column}
        contentContainerStyle={{ padding: space.x1 }}
        onContentSizeChange={() => {
          // 처음 열 때 선택값이 가운데 오도록 (한 번만, 내용 높이가 잡힌 뒤)
          if (scrolled.current) return;
          scrolled.current = true;
          const idx = Math.max(0, values.indexOf(selected));
          ref.current?.scrollTo({ y: Math.max(0, idx * ROW - (COLUMN_HEIGHT - ROW) / 2), animated: false });
        }}>
        {values.map((v) => {
          const on = v === selected;
          return (
            <Press
              key={v}
              onPress={() => onSelect(v)}
              scale={0}
              pressedBg={!on}
              accessibilityRole="button"
              accessibilityLabel={`${v}${title}`}
              accessibilityState={{ selected: on }}
              style={[s.cell, on && s.cellOn]}>
              <Text variant={on ? 't5-bold' : 't5-medium'} color={on ? 'neutralInverted' : 'neutral'} tabular>
                {pad(v)}
              </Text>
            </Press>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  box: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x2,
    paddingHorizontal: space.x4,
    borderRadius: radius.r3,
    borderWidth: 1,
    borderColor: color.stroke.neutralWeak,
  },
  boxOpen: { borderWidth: 2, borderColor: color.stroke.neutralContrast, paddingHorizontal: space.x4 - 1 },
  columns: { flexDirection: 'row', gap: space.x3, marginTop: space.x2 },
  column: { height: COLUMN_HEIGHT, flexGrow: 0, borderRadius: radius.r3, backgroundColor: color.bg.layerFill },
  cell: { height: ROW, alignItems: 'center', justifyContent: 'center', borderRadius: radius.r2 },
  cellOn: { backgroundColor: color.bg.neutralInverted },
});
