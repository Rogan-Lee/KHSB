import { X } from 'lucide-react-native';
import { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';

import { colors, palette, radius, spacing, type } from '@/constants/theme';

export type Opt = { value: string; label: string };
export const opt = (s: string): Opt => ({ value: s, label: s });
export const opts = (arr: string[]): Opt[] => arr.map(opt);

export function SurveyField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      {children}
    </View>
  );
}

export function TextField({
  value,
  onChangeText,
  multiline,
  style,
  ...props
}: TextInputProps & { value: string; onChangeText: (t: string) => void }) {
  return (
    <TextInput
      {...props}
      multiline={multiline}
      onChangeText={onChangeText}
      placeholderTextColor={colors.textAssistive}
      style={[styles.input, multiline && styles.inputMultiline, style]}
      textAlignVertical={multiline ? 'top' : 'center'}
      value={value}
    />
  );
}

/** 칩 선택 — multi=false 면 단일(라디오), true 면 다중(체크박스). */
export function ChipSelect({
  options,
  value,
  onChange,
  multi,
}: {
  options: Opt[];
  value: string | string[];
  onChange: (next: string | string[]) => void;
  multi?: boolean;
}) {
  const selected = (o: string) =>
    multi ? (value as string[]).includes(o) : value === o;

  function toggle(o: string) {
    if (multi) {
      const arr = value as string[];
      onChange(arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o]);
    } else {
      onChange(value === o ? '' : o);
    }
  }

  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const on = selected(o.value);
        return (
          <Pressable
            key={o.value}
            onPress={() => toggle(o.value)}
            style={({ pressed }) => [
              styles.chip,
              on && styles.chipOn,
              pressed && { opacity: 0.7 },
            ]}>
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** 1~max 평점 선택 (0 = 미선택). */
export function Rating({
  value,
  onChange,
  max = 5,
  lowLabel,
  highLabel,
}: {
  value: number;
  onChange: (n: number) => void;
  max?: number;
  lowLabel?: string;
  highLabel?: string;
}) {
  return (
    <View>
      <View style={styles.rating}>
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => {
          const on = value === n;
          return (
            <Pressable
              key={n}
              onPress={() => onChange(n)}
              style={({ pressed }) => [
                styles.ratingDot,
                on && styles.ratingDotOn,
                pressed && { opacity: 0.7 },
              ]}>
              <Text style={[styles.ratingText, on && styles.ratingTextOn]}>{n}</Text>
            </Pressable>
          );
        })}
      </View>
      {lowLabel || highLabel ? (
        <View style={styles.ratingLabels}>
          <Text style={styles.ratingLabelText}>{lowLabel}</Text>
          <Text style={styles.ratingLabelText}>{highLabel}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** 반복 행 컨테이너 — 헤더 + 선택적 삭제 버튼. */
export function RowCard({
  title,
  onRemove,
  children,
}: {
  title: string;
  onRemove?: () => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.rowCard}>
      <View style={styles.rowHead}>
        <Text style={styles.rowTitle}>{title}</Text>
        {onRemove ? (
          <Pressable
            hitSlop={8}
            onPress={onRemove}
            style={({ pressed }) => pressed && { opacity: 0.6 }}>
            <X color={colors.textAssistive} size={18} />
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export function AddRowButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.addRow, pressed && { opacity: 0.7 }]}>
      <Text style={styles.addRowText}>＋ {label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  fieldLabel: { ...type.label1, color: colors.textNormal },
  fieldHint: { ...type.caption1, color: colors.textAssistive, marginTop: -2 },

  input: {
    backgroundColor: colors.surface,
    borderColor: colors.lineStrong,
    borderRadius: radius.lg,
    borderWidth: 1,
    color: colors.textNormal,
    paddingHorizontal: 14,
    paddingVertical: 11,
    ...type.body3,
  },
  inputMultiline: { minHeight: 92, paddingTop: 11 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: colors.fillAlt,
    borderColor: colors.lineNeutral,
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipOn: { backgroundColor: palette.blue50, borderColor: palette.blue50 },
  chipText: { ...type.caption1, color: colors.textAlternative, fontWeight: '600' },
  chipTextOn: { color: colors.textOncolor },

  rating: { flexDirection: 'row', gap: 8 },
  ratingDot: {
    alignItems: 'center',
    backgroundColor: colors.fillAlt,
    borderColor: colors.lineNeutral,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 12,
  },
  ratingDotOn: { backgroundColor: palette.blue50, borderColor: palette.blue50 },
  ratingText: { ...type.label1, color: colors.textAlternative },
  ratingTextOn: { color: colors.textOncolor },
  ratingLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  ratingLabelText: { ...type.caption2, color: colors.textAssistive },

  rowCard: {
    backgroundColor: colors.bgAlternative,
    borderRadius: radius.lg,
    gap: spacing.md,
    padding: spacing.md,
  },
  rowHead: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  rowTitle: { ...type.label2, color: colors.textNormal },

  addRow: {
    alignItems: 'center',
    borderColor: colors.lineStrong,
    borderRadius: radius.lg,
    borderStyle: 'dashed',
    borderWidth: 1,
    paddingVertical: 12,
  },
  addRowText: { ...type.label2, color: palette.blue50 },
});
