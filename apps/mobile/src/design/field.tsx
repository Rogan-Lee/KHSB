import { forwardRef, useState, type ReactNode } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Text } from './text';
import { color, radius, space, text } from './tokens';

/**
 * SEED TextField (outline, large) — 라벨 t5-medium · 보조 표시("선택") · 설명 · 에러 · 글자 수.
 * 웹 포털의 TextField/TextFieldInput 과 같은 모양.
 */
export type TextFieldProps = Omit<TextInputProps, 'style'> & {
  label?: string;
  /** 라벨 옆 보조 표시 (예: "선택") */
  indicator?: string;
  description?: ReactNode;
  errorMessage?: string | null;
  /** 여러 줄 입력 최소 높이 (multiline 일 때) */
  minHeight?: number;
  /** 글자 수 표시 (maxLength 와 함께) */
  showCount?: boolean;
  prefix?: ReactNode;
  suffix?: ReactNode;
  /** 큰 가운데 정렬 입력 (PIN·단어 시험) */
  size?: 'md' | 'lg';
};

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  {
    label,
    indicator,
    description,
    errorMessage,
    minHeight,
    showCount,
    prefix,
    suffix,
    size = 'md',
    multiline,
    editable = true,
    value,
    maxLength,
    onFocus,
    onBlur,
    ...rest
  },
  ref
) {
  const [focused, setFocused] = useState(false);
  const invalid = !!errorMessage;
  const borderColor = invalid
    ? color.stroke.criticalSolid
    : focused
      ? color.stroke.neutralContrast
      : color.stroke.neutralWeak;

  return (
    <View style={{ gap: space.x2 }}>
      {label != null && (
        <Text variant="t5-medium">
          {label}
          {indicator != null && (
            <Text variant="t4-regular" color="neutralSubtle">
              {'  '}
              {indicator}
            </Text>
          )}
        </Text>
      )}
      <View
        style={[
          s.box,
          {
            borderColor,
            borderWidth: focused || invalid ? 2 : 1,
            // 테두리 두께가 바뀌어도 내용이 움직이지 않도록 패딩 보정
            paddingHorizontal: space.x4 - (focused || invalid ? 1 : 0),
            minHeight: multiline ? (minHeight ?? 120) : size === 'lg' ? 64 : 52,
            backgroundColor: editable ? color.bg.layerDefault : color.bg.disabled,
            alignItems: multiline ? 'flex-start' : 'center',
          },
        ]}>
        {prefix}
        <TextInput
          ref={ref}
          value={value}
          maxLength={maxLength}
          multiline={multiline}
          editable={editable}
          placeholderTextColor={color.fg.placeholder}
          selectionColor={color.fg.brand}
          maxFontSizeMultiplier={1.5}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            size === 'lg' ? text('t7-medium') : text('t5-regular'),
            s.input,
            {
              color: editable ? color.fg.neutral : color.fg.disabled,
              textAlign: size === 'lg' ? 'center' : 'left',
              paddingVertical: multiline ? space.x3_5 : 0,
              textAlignVertical: multiline ? 'top' : 'center',
              minHeight: multiline ? (minHeight ?? 120) - 4 : undefined,
            },
          ]}
          {...rest}
        />
        {suffix}
      </View>
      {(errorMessage || description != null || (showCount && maxLength)) && (
        <View style={s.footer}>
          <View style={{ flex: 1 }}>
            {errorMessage ? (
              <Text variant="t3-regular" color="critical">
                {errorMessage}
              </Text>
            ) : typeof description === 'string' ? (
              <Text variant="t3-regular" color="neutralSubtle">
                {description}
              </Text>
            ) : (
              description
            )}
          </View>
          {showCount && maxLength != null && (
            <Text variant="t3-regular" color="neutralSubtle" tabular>
              {(value ?? '').length}/{maxLength}
            </Text>
          )}
        </View>
      )}
    </View>
  );
});

const s = StyleSheet.create({
  box: {
    flexDirection: 'row',
    gap: space.x2,
    borderRadius: radius.r3,
  },
  input: { flex: 1, padding: 0, margin: 0 },
  footer: { flexDirection: 'row', gap: space.x2 },
});
