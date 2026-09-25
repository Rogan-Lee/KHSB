import {
  Check,
  ChevronDown,
  CircleAlert,
  History,
  Lightbulb,
  Lock,
  Plus,
  Trash2,
  type LucideIcon,
} from 'lucide-react-native';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';

import {
  Badge,
  BottomSheet,
  Button,
  Chip,
  ChipGroup,
  confirm,
  color,
  Notice,
  Press,
  radius,
  Segmented,
  shadow,
  space,
  Text,
  text,
  TextField,
} from '@/design';
import type { SaveState } from '@/lib/api/student-survey';
import * as S from '@/lib/survey-schema';

/**
 * 초기 설문 입력 조각 + 질문 종류별 편집기 — 웹 포털 `src/components/online/*-survey-step.tsx`(SEED)와
 * 같은 구성·문구. 디자인 키트(@/design) 위에 설문 전용 컨트롤(격자 선택·선택 상자·슬라이더·월 선택·등급 칸)을 얹는다.
 */

// ─── 자동저장 표시 ───────────────────────────────────────────────────

export function SaveIndicator({ status, locked }: { status: SaveState; locked?: boolean }) {
  let icon: ReactNode = null;
  let label: string | null = null;
  let tone: 'neutralSubtle' | 'positive' | 'critical' = 'neutralSubtle';
  if (locked) {
    icon = <Lock color={color.fg.neutralSubtle} size={14} strokeWidth={2.4} />;
    label = '제출 후 잠김';
  } else if (status === 'saving') {
    icon = <ActivityIndicator size="small" color={color.fg.neutralSubtle} style={s.spinner} />;
    label = '저장 중';
  } else if (status === 'saved') {
    icon = <Check color={color.fg.positive} size={14} strokeWidth={2.8} />;
    label = '저장됨';
    tone = 'positive';
  } else if (status === 'error') {
    icon = <CircleAlert color={color.fg.critical} size={14} strokeWidth={2.4} />;
    label = '저장 실패';
    tone = 'critical';
  }
  return (
    <View style={s.saveIndicator} accessibilityLiveRegion="polite">
      {icon}
      {label != null && (
        <Text variant="t3-bold" color={tone} numberOfLines={1}>
          {label}
        </Text>
      )}
    </View>
  );
}

// ─── 묶음 · 반복 카드 ────────────────────────────────────────────────

/** 질문 안의 묶음 — t6-bold 제목 + 설명 + 본문(gap x3) */
export function FormSection({
  title,
  description,
  aside,
  children,
}: {
  title: string;
  description?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View>
      <View style={s.formHead}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="t6-bold" accessibilityRole="header">
            {title}
          </Text>
          {description != null &&
            (typeof description === 'string' ? (
              <Text variant="t4-regular" color="neutralSubtle" style={{ marginTop: space.x1 }}>
                {description}
              </Text>
            ) : (
              description
            ))}
        </View>
        {aside != null && <View style={{ paddingTop: space.x0_5 }}>{aside}</View>}
      </View>
      <View style={{ marginTop: space.x4, gap: space.x3 }}>{children}</View>
    </View>
  );
}

/** 반복 입력 묶음 (과목·도서·기관·카드) — 흰 화면 위 회색(layerFill) 블록 */
export function EntryBlock({
  title,
  badge,
  action,
  children,
}: {
  title: string;
  badge?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={s.entry}>
      <View style={s.entryHead}>
        <View style={s.entryTitle}>
          <Text variant="t5-bold" numberOfLines={1} style={{ flexShrink: 1 }}>
            {title}
          </Text>
          {badge}
        </View>
        {action}
      </View>
      <View style={{ gap: space.x5 }}>{children}</View>
    </View>
  );
}

/** 블록 오른쪽 위 작은 텍스트 동작 (삭제·비우기) */
export function RowAction({
  label,
  onPress,
  icon: Icon = Trash2,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  icon?: LucideIcon;
  accessibilityLabel?: string;
}) {
  return (
    <Press
      onPress={onPress}
      scale={0}
      pressedBg
      hitSlop={6}
      accessibilityLabel={accessibilityLabel ?? label}
      style={s.rowAction}>
      <Icon color={color.fg.neutralSubtle} size={16} strokeWidth={2.2} />
      <Text variant="t4-medium" color="neutralSubtle">
        {label}
      </Text>
    </Press>
  );
}

/** 라벨 + 보조 표시 + 선택 컨트롤 (SEED Fieldset) */
export function ChoiceField({
  label,
  indicator,
  children,
}: {
  label: string;
  indicator?: string;
  children: ReactNode;
}) {
  return (
    <View style={{ gap: space.x2_5 }}>
      <Text variant="t5-medium">
        {label}
        {indicator != null && (
          <Text variant="t4-regular" color="neutralSubtle">
            {'  '}
            {indicator}
          </Text>
        )}
      </Text>
      {children}
    </View>
  );
}

/** 이전 버전 설문에서 자유 서술로 적은 답 — 참고용 */
export function LegacyNotice({ text: legacy }: { text?: string }) {
  if (!legacy) return null;
  return (
    <Notice tone="warn" icon={History} title="이전에 적은 답변">
      {`\n${legacy}\n`}
      <Text variant="t3-regular" color={color.fg.warningContrast}>
        참고용으로만 보여요. 아래 항목에 맞춰 다시 적어 주세요.
      </Text>
    </Notice>
  );
}

// ─── 선택 컨트롤 ─────────────────────────────────────────────────────

type OptionLike<T extends string> = T | S.Option<T>;
const toOption = <T extends string>(o: OptionLike<T>): S.Option<T> =>
  typeof o === 'string' ? { value: o, label: o } : o;

/** 하나만 고르는 칩 (SEED Chip.RadioItem outlineStrong) */
export function SingleChips<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: readonly OptionLike<T>[];
  value: string;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <ChipGroup>
      {options.map(toOption).map((o) => (
        <Chip key={o.value} size="lg" selected={value === o.value} disabled={disabled} onPress={() => onChange(o.value)}>
          {o.label}
        </Chip>
      ))}
    </ChipGroup>
  );
}

/** 여러 개 고르는 칩 (SEED Chip.Toggle outlineStrong) */
export function MultiChips({
  options,
  values,
  onToggle,
  disabled,
}: {
  options: readonly string[];
  values: string[];
  onToggle: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <ChipGroup>
      {options.map((o) => (
        <Chip key={o} size="lg" selected={values.includes(o)} disabled={disabled} onPress={() => onToggle(o)}>
          {o}
        </Chip>
      ))}
    </ChipGroup>
  );
}

/** 폭을 똑같이 나눠 갖는 한 줄 선택 (강·중·약, 1–5 척도, 카드 전형·성향) */
export function GridChoice<T extends string>({
  options,
  value,
  onChange,
  disabled,
  itemLabel,
}: {
  options: readonly OptionLike<T>[];
  value: string;
  onChange: (v: T) => void;
  disabled?: boolean;
  /** 스크린리더용 항목 이름 (예: n => `만족도 ${n}점`) */
  itemLabel?: (o: S.Option<T>) => string;
}) {
  return (
    <View style={s.grid} accessibilityRole="radiogroup">
      {options.map(toOption).map((o) => {
        const on = value === o.value;
        return (
          <View key={o.value} style={{ flex: 1, minWidth: 0 }}>
            <Press
              onPress={() => onChange(o.value)}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityLabel={itemLabel?.(o) ?? o.label}
              accessibilityState={{ checked: on, disabled }}
              pressedBg={on ? color.bg.neutralInvertedPressed : color.bg.transparentPressed}
              style={[s.gridItem, on && s.gridItemOn, disabled && s.dim]}>
              <Text
                variant={on ? 't4-bold' : 't4-medium'}
                color={on ? 'neutralInverted' : 'neutral'}
                tabular
                numberOfLines={1}>
                {o.label}
              </Text>
            </Press>
          </View>
        );
      })}
    </View>
  );
}

/** 세로로 쌓인 선택 상자 + 라디오 표시 (SEED RadioSelectBox) */
export function SelectBoxGroup<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: readonly OptionLike<T>[];
  value: string;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ gap: space.x2 }} accessibilityRole="radiogroup">
      {options.map(toOption).map((o) => {
        const on = value === o.value;
        return (
          <Press
            key={o.value}
            onPress={() => onChange(o.value)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, disabled }}
            pressedBg={color.bg.layerDefaultPressed}
            style={[s.selectBox, on && s.selectBoxOn, disabled && s.selectBoxDisabled]}>
            <Text variant={on ? 't5-bold' : 't5-medium'} color={disabled && !on ? 'neutralSubtle' : 'neutral'} style={{ flex: 1 }}>
              {o.label}
            </Text>
            <View style={[s.radio, on && s.radioOn]}>{on && <View style={s.radioDot} />}</View>
          </Press>
        );
      })}
    </View>
  );
}

/** 체크박스 한 줄 (미등록 등) */
export function CheckToggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Press
      onPress={() => onChange(!checked)}
      disabled={disabled}
      scale={0}
      hitSlop={6}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      style={[s.check, disabled && s.dim]}>
      <View style={[s.checkBox, checked && s.checkBoxOn]}>
        {checked && <Check color={color.palette.staticWhite} size={14} strokeWidth={3} />}
      </View>
      <Text variant="t4-medium">{label}</Text>
    </Press>
  );
}

const SCALE = ['1', '2', '3', '4', '5'] as const;

/** 1–5 척도 (0 = 미선택) — 양 끝 설명 포함 */
export function ScaleRating({
  label,
  value,
  onChange,
  low,
  high,
  numbered = true,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  low: string;
  high: string;
  /** 양 끝 설명에 1 · / · 5 를 붙일지 */
  numbered?: boolean;
  disabled?: boolean;
}) {
  return (
    <View style={{ gap: space.x2 }}>
      <GridChoice
        options={SCALE}
        value={value ? String(value) : ''}
        onChange={(v) => onChange(Number(v))}
        disabled={disabled}
        itemLabel={(o) => `${label} ${o.value}점`}
      />
      <View style={s.scaleEnds}>
        <Text variant="t3-regular" color="neutralSubtle">
          {numbered ? `1 · ${low}` : low}
        </Text>
        <Text variant="t3-regular" color="neutralSubtle" align="right">
          {numbered ? `${high} · 5` : high}
        </Text>
      </View>
    </View>
  );
}

// ─── 슬라이더 (학습 시간 분배) ───────────────────────────────────────

const THUMB = 24;

export function PercentSlider({
  value,
  onChange,
  step = 5,
  disabled,
  accessibilityLabel,
}: {
  value: number;
  onChange: (n: number) => void;
  step?: number;
  disabled?: boolean;
  accessibilityLabel: string;
}) {
  const [width, setWidth] = useState(0);
  // 제스처 중 값 (렌더와 무관) — 이벤트 핸들러에서만 읽고 쓴다
  const live = useRef({ width: 0, startX: 0, startPageX: 0, dragging: false, last: value });

  const setFromX = (x: number) => {
    const st = live.current;
    const usable = st.width - THUMB;
    if (usable <= 0) return;
    const raw = ((x - THUMB / 2) / usable) * 100;
    const next = Math.max(0, Math.min(100, Math.round(raw / step) * step));
    if (next !== st.last) {
      st.last = next;
      onChange(next);
    }
  };

  const pct = Math.max(0, Math.min(100, value)) / 100;
  const pos = Math.max(0, width - THUMB) * pct;

  return (
    <View
      onLayout={(e) => {
        live.current.width = e.nativeEvent.layout.width;
        setWidth(e.nativeEvent.layout.width);
      }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      accessibilityValue={{ min: 0, max: 100, now: value, text: `${value}%` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (disabled) return;
        const d = e.nativeEvent.actionName === 'increment' ? step : -step;
        onChange(Math.max(0, Math.min(100, value + d)));
      }}
      style={[s.slider, disabled && s.dim]}
      onStartShouldSetResponder={() => !disabled}
      onResponderGrant={(e) => {
        live.current.startX = e.nativeEvent.locationX;
        live.current.startPageX = e.nativeEvent.pageX;
        live.current.dragging = false;
        live.current.last = value;
      }}
      onResponderMove={(e) => {
        const dx = e.nativeEvent.pageX - live.current.startPageX;
        if (!live.current.dragging && Math.abs(dx) < 3) return;
        live.current.dragging = true;
        setFromX(live.current.startX + dx);
      }}
      onResponderRelease={() => {
        if (!live.current.dragging) setFromX(live.current.startX);
      }}
      // 가로로 끌기 시작한 뒤에는 세로 스크롤에 넘겨주지 않는다
      onResponderTerminationRequest={() => !live.current.dragging}>
      <View pointerEvents="none" style={s.sliderTrack} />
      <View pointerEvents="none" style={[s.sliderRange, { width: pos }]} />
      <View pointerEvents="none" style={[s.sliderThumb, { left: pos }]} />
    </View>
  );
}

// ─── 월 선택 (YYYY-MM) ──────────────────────────────────────────────

const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1));

function parseMonth(v: string): { y: number; m: number } | null {
  const hit = /^(\d{4})-(\d{2})$/.exec(v);
  if (!hit) return null;
  const y = Number(hit[1]);
  const m = Number(hit[2]);
  return m >= 1 && m <= 12 ? { y, m } : null;
}

export const formatMonth = (v: string) => {
  const p = parseMonth(v);
  return p ? `${p.y}년 ${p.m}월` : '';
};

/** 입력칸처럼 생긴 월 선택 — 누르면 바텀시트에서 연도·월을 고른다 (웹 input type="month") */
export function MonthField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const parsed = parseMonth(value);
  const thisYear = new Date().getFullYear();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(parsed?.y ?? thisYear);
  const parsedYear = parsed?.y;
  const years = useMemo(() => {
    const list = Array.from({ length: 7 }, (_, i) => thisYear - 6 + i);
    if (parsedYear != null && !list.includes(parsedYear)) list.unshift(parsedYear);
    return list;
  }, [thisYear, parsedYear]);

  const show = () => {
    setYear(parsed?.y ?? thisYear);
    setOpen(true);
  };
  const pick = (m: string) => {
    onChange(`${year}-${m.padStart(2, '0')}`);
    setOpen(false);
  };
  const selectedMonth = parsed && parsed.y === year ? String(parsed.m) : '';

  return (
    <View style={{ gap: space.x2 }}>
      <Text variant="t5-medium">{label}</Text>
      <Press
        onPress={show}
        disabled={disabled}
        scale={0}
        pressedBg={color.bg.layerDefaultPressed}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${parsed ? formatMonth(value) : '선택 안 함'}`}
        style={[s.fieldBox, disabled && { backgroundColor: color.bg.disabled }]}>
        <Text
          variant="t5-regular"
          color={disabled ? 'disabled' : parsed ? 'neutral' : 'placeholder'}
          numberOfLines={1}
          style={{ flex: 1 }}>
          {parsed ? formatMonth(value) : '선택'}
        </Text>
        <ChevronDown color={color.fg.neutralSubtle} size={18} strokeWidth={2} />
      </Press>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        footer={
          <>
            {parsed && (
              <View style={{ flex: 1 }}>
                <Button
                  variant="gray"
                  size="lg"
                  block
                  onPress={() => {
                    onChange('');
                    setOpen(false);
                  }}>
                  지우기
                </Button>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Button variant="gray" size="lg" block onPress={() => setOpen(false)}>
                닫기
              </Button>
            </View>
          </>
        }>
        <ChipGroup>
          {years.map((y) => (
            <Chip key={y} size="md" selected={y === year} onPress={() => setYear(y)}>
              {`${y}년`}
            </Chip>
          ))}
        </ChipGroup>
        <View style={{ gap: space.x2, marginTop: space.x2 }}>
          {[0, 1, 2].map((row) => (
            <GridChoice
              key={row}
              options={MONTHS.slice(row * 4, row * 4 + 4).map((m) => ({ value: m, label: `${m}월` }))}
              value={selectedMonth}
              onChange={pick}
              itemLabel={(o) => `${year}년 ${o.label}`}
            />
          ))}
        </View>
      </BottomSheet>
    </View>
  );
}

// ─── 숫자 입력 ───────────────────────────────────────────────────────

/** 숫자만 (최대 자릿수) */
export const digitsOnly = (t: string, max = 3) => t.replace(/[^0-9]/g, '').slice(0, max);
/** 소수 한 자리까지 (예: 1.5) — 쉼표 소수점도 받아 준다 */
export const decimalOnly = (t: string, max = 4) => {
  const cleaned = t.replace(/,/g, '.').replace(/[^0-9.]/g, '');
  const [head, ...rest] = cleaned.split('.');
  return (rest.length ? `${head}.${rest.join('')}` : head).slice(0, max);
};

/** 좁은 격자용 가운데 정렬 숫자 칸 (내신·모의 등급, 백분위) */
export function GradeInput({
  value,
  onChange,
  mode,
  disabled,
  accessibilityLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  /** grade: 1–9 소수 허용 · gradeInt: 1–9 정수 · percentile: 0–100 */
  mode: 'grade' | 'gradeInt' | 'percentile';
  disabled?: boolean;
  accessibilityLabel: string;
}) {
  const [focused, setFocused] = useState(false);
  const invalid = value !== '' && !(mode === 'percentile' ? S.isValidPercentile(value) : S.isValidGrade(value));
  const border = invalid ? color.stroke.criticalSolid : focused ? color.stroke.neutralContrast : color.stroke.neutralWeak;
  return (
    <TextInput
      value={value}
      onChangeText={(t) => onChange(mode === 'grade' ? decimalOnly(t, 4) : digitsOnly(t, mode === 'percentile' ? 3 : 1))}
      editable={!disabled}
      keyboardType={mode === 'grade' ? 'decimal-pad' : 'number-pad'}
      placeholder="-"
      placeholderTextColor={color.fg.placeholder}
      selectionColor={color.fg.brand}
      maxFontSizeMultiplier={1.3}
      accessibilityLabel={accessibilityLabel}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[
        text('t5-regular'),
        s.gradeInput,
        {
          borderColor: border,
          borderWidth: focused || invalid ? 2 : 1,
          color: disabled ? color.fg.disabled : color.fg.neutral,
          backgroundColor: disabled ? color.bg.disabled : color.bg.layerDefault,
        },
      ]}
    />
  );
}

// ─── 질문 종류별 편집기 ──────────────────────────────────────────────

type EditorProps<T> = {
  value: T;
  update: (fn: (prev: T) => T) => void;
  locked: boolean;
};

const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
const hasContent = (o: object) =>
  Object.values(o).some((x) => (typeof x === 'string' ? x.trim() !== '' : Array.isArray(x) ? x.length > 0 : false));

/** 적어 둔 내용이 있으면 한 번 묻고 지운다 */
async function confirmRemove(what: string, filled: boolean) {
  if (!filled) return true;
  return confirm({
    title: `${what} 삭제할까요?`,
    message: '적어 둔 내용이 함께 지워져요.',
    confirmText: '삭제',
    destructive: true,
  });
}

const TWO_COL = { flexDirection: 'row', gap: space.x2 } as const;
const COL = { flex: 1, minWidth: 0 } as const;

export function SurveySectionEditor({
  kind,
  value,
  update,
  locked,
  gradeNumber,
  title,
  placeholder,
}: {
  kind: S.SurveyKind;
  value: S.SurveyAnswer;
  update: (fn: (prev: S.SurveyAnswer) => S.SurveyAnswer) => void;
  locked: boolean;
  gradeNumber: 1 | 2 | 3 | null;
  title: string;
  placeholder?: string;
}) {
  // 각 편집기는 자기 shape 로 다룬다 — kind 와 value 는 서버에서 짝지어 내려온다.
  const common = { update: update as never, locked };
  switch (kind) {
    case 'text':
      return <TextEditor {...common} value={value as S.TextAnswer} title={title} placeholder={placeholder} />;
    case 'performance':
      return <PerformanceEditor {...common} value={value as S.PerformanceAnswer} />;
    case 'history':
      return <HistoryEditor {...common} value={value as S.HistoryAnswer} />;
    case 'goals':
      return <GoalsEditor {...common} value={value as S.GoalsAnswer} />;
    case 'admissionType':
      return <AdmissionTypeEditor {...common} value={value as S.AdmissionTypeAnswer} gradeNumber={gradeNumber} />;
    case 'strengthsWeaknesses':
      return <StrengthsWeaknessesEditor {...common} value={value as S.StrengthsWeaknessesAnswer} />;
  }
}

// ── text ──

function TextEditor({
  value,
  update,
  locked,
  title,
  placeholder,
}: EditorProps<S.TextAnswer> & { title: string; placeholder?: string }) {
  return (
    <TextField
      value={value.answer}
      onChangeText={(t) => update(() => ({ answer: t }))}
      editable={!locked}
      multiline
      minHeight={204}
      placeholder={placeholder}
      accessibilityLabel={title}
      description={
        locked ? undefined : '입력하면 자동으로 저장돼요. 자유롭게 적고, 부족하면 나중에 돌아와도 괜찮아요.'
      }
    />
  );
}

// ── performance ──

function PerformanceEditor({ value: v, update, locked }: EditorProps<S.PerformanceAnswer>) {
  const setSubject = (i: number, patch: Partial<S.PerformanceSubject>) =>
    update((p) => ({ ...p, subjects: p.subjects.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const setBook = (i: number, patch: Partial<S.PerformanceBook>) =>
    update((p) => ({ ...p, books: p.books.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const removeSubject = async (i: number) => {
    if (!(await confirmRemove('이 과목을', hasContent(v.subjects[i])))) return;
    update((p) => ({ ...p, subjects: p.subjects.filter((_, j) => j !== i) }));
  };
  const removeBook = async (i: number) => {
    if (!(await confirmRemove('이 도서를', hasContent(v.books[i])))) return;
    update((p) => ({ ...p, books: p.books.filter((_, j) => j !== i) }));
  };

  return (
    <View style={s.editor}>
      <LegacyNotice text={v.legacyText} />

      <FormSection title="과목별 탐구 경험" description="과목마다 탐구 주제와 방식, 내가 주도한 부분을 적어 주세요.">
        {v.subjects.map((x, i) => (
          <EntryBlock
            key={i}
            title={`과목 ${i + 1}`}
            action={
              v.subjects.length > 1 && !locked ? (
                <RowAction label="삭제" accessibilityLabel={`과목 ${i + 1} 삭제`} onPress={() => void removeSubject(i)} />
              ) : null
            }>
            <TextField
              label="과목명"
              value={x.subject}
              onChangeText={(t) => setSubject(i, { subject: t })}
              editable={!locked}
              placeholder="예: 생명과학Ⅰ"
            />
            <TextField
              label="탐구 주제"
              value={x.topic}
              onChangeText={(t) => setSubject(i, { topic: t })}
              editable={!locked}
              placeholder="어떤 주제로 탐구했나요?"
            />
            <ChoiceField label="탐구 방식" indicator="여러 개 고를 수 있어요">
              <MultiChips
                options={S.PERFORMANCE_METHOD_OPTIONS}
                values={x.methods}
                onToggle={(m) => setSubject(i, { methods: toggleIn(x.methods, m) })}
                disabled={locked}
              />
              {x.methods.includes('기타') && (
                <TextField
                  value={x.methodOther ?? ''}
                  onChangeText={(t) => setSubject(i, { methodOther: t })}
                  editable={!locked}
                  placeholder="기타 방식을 적어 주세요"
                  accessibilityLabel="기타 탐구 방식"
                />
              )}
            </ChoiceField>
            <TextField
              label="내가 주도한 부분"
              value={x.selfRole}
              onChangeText={(t) => setSubject(i, { selfRole: t })}
              editable={!locked}
              multiline
              minHeight={96}
              placeholder="탐구 설계, 데이터 수집·분석, 발표 등 구체적으로 적어 주세요"
            />
          </EntryBlock>
        ))}
        {!locked && (
          <Button
            variant="weak"
            size="md"
            block
            icon={Plus}
            onPress={() => update((p) => ({ ...p, subjects: [...p.subjects, S.emptyPerformanceSubject()] }))}>
            과목 추가
          </Button>
        )}
      </FormSection>

      <FormSection title="교과 연계 독서" description="읽은 책과 이유, 연결 교과, 확장 탐구를 적어 주세요.">
        {v.books.map((b, i) => (
          <EntryBlock
            key={i}
            title={`도서 ${i + 1}`}
            action={
              v.books.length > 1 && !locked ? (
                <RowAction label="삭제" accessibilityLabel={`도서 ${i + 1} 삭제`} onPress={() => void removeBook(i)} />
              ) : null
            }>
            <TextField
              label="책 제목"
              value={b.title}
              onChangeText={(t) => setBook(i, { title: t })}
              editable={!locked}
              placeholder="책 제목을 적어 주세요"
            />
            <TextField
              label="연결 교과"
              value={b.linkedSubject}
              onChangeText={(t) => setBook(i, { linkedSubject: t })}
              editable={!locked}
              placeholder="예: 생명과학Ⅰ"
            />
            <TextField
              label="읽은 이유"
              value={b.reason}
              onChangeText={(t) => setBook(i, { reason: t })}
              editable={!locked}
              multiline
              minHeight={96}
              placeholder="이 책을 고른 이유를 적어 주세요"
            />
            <TextField
              label="인상 깊은 개념 · 확장 탐구"
              value={b.expansion}
              onChangeText={(t) => setBook(i, { expansion: t })}
              editable={!locked}
              multiline
              minHeight={96}
              placeholder="책에서 발전시킨 탐구나 적용 사례를 적어 주세요"
            />
          </EntryBlock>
        ))}
        {!locked && (
          <Button
            variant="weak"
            size="md"
            block
            icon={Plus}
            onPress={() => update((p) => ({ ...p, books: [...p.books, S.emptyPerformanceBook()] }))}>
            도서 추가
          </Button>
        )}
      </FormSection>

      <FormSection title="진로 탐색 수준" description="지금 진로를 어느 정도 정했나요?">
        <Segmented<S.CareerLevel>
          options={S.CAREER_LEVELS}
          value={v.careerLevel}
          onChange={(careerLevel) => update((p) => ({ ...p, careerLevel }))}
          disabled={locked}
        />
        {v.careerLevel === 'specified' && (
          <View style={{ paddingTop: space.x3 }}>
            <TextField
              label="희망 진로 · 전공"
              value={v.careerDetail}
              onChangeText={(t) => update((p) => ({ ...p, careerDetail: t }))}
              editable={!locked}
              placeholder="예: 약학과 — 신약 개발 연구원"
            />
          </View>
        )}
      </FormSection>

      <FormSection title="활동 결과물" description="해당하는 걸 모두 골라 주세요.">
        <MultiChips
          options={S.PERFORMANCE_OUTPUT_OPTIONS}
          values={v.outputs}
          onToggle={(o) => update((p) => ({ ...p, outputs: toggleIn(p.outputs, o) }))}
          disabled={locked}
        />
        {v.outputs.includes('기타') && (
          <TextField
            value={v.outputOther ?? ''}
            onChangeText={(t) => update((p) => ({ ...p, outputOther: t }))}
            editable={!locked}
            placeholder="기타 결과물 형태를 적어 주세요"
            accessibilityLabel="기타 결과물 형태"
          />
        )}
      </FormSection>
    </View>
  );
}

// ── history ──

const YES_NO: S.Option<'yes' | 'no'>[] = [
  { value: 'yes', label: '있어요' },
  { value: 'no', label: '없어요' },
];

function HistoryEditor({ value: v, update, locked }: EditorProps<S.HistoryAnswer>) {
  const setPrior = (i: number, patch: Partial<S.PriorEducation>) =>
    update((p) => ({ ...p, priorEducation: p.priorEducation.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const removePrior = async (i: number) => {
    if (!(await confirmRemove('이 기관을', hasContent(v.priorEducation[i])))) return;
    update((p) => ({ ...p, priorEducation: p.priorEducation.filter((_, j) => j !== i) }));
  };
  const setMix = (k: S.StudyMixKey, n: number) =>
    update((p) => ({ ...p, currentMix: { ...p.currentMix, [k]: Math.max(0, Math.min(100, Math.round(n))) } }));
  const setConsultingHad = (had: 'yes' | 'no') =>
    update((p) => ({
      ...p,
      priorConsulting:
        had === 'yes'
          ? p.priorConsulting.had === 'yes'
            ? p.priorConsulting
            : { had: 'yes', institution: '', period: '', satisfaction: 0 }
          : { had: 'no' },
    }));
  const setConsulting = (patch: Partial<{ institution: string; period: string; satisfaction: number }>) =>
    update((p) => (p.priorConsulting.had === 'yes' ? { ...p, priorConsulting: { ...p.priorConsulting, ...patch } } : p));

  const sum = S.mixSum(v.currentMix);
  const pc = v.priorConsulting;

  return (
    <View style={s.editor}>
      <LegacyNotice text={v.legacyText} />

      <FormSection title="이전 학습 경험" description="학원·과외·인강·관리형 등 다녀 본 곳이 있나요?">
        <Segmented<'' | 'yes' | 'no'>
          options={YES_NO}
          value={v.hasPriorEducation}
          onChange={(had) => update((p) => ({ ...p, hasPriorEducation: had }))}
          disabled={locked}
        />
        {v.hasPriorEducation === 'yes' && (
          <View style={{ gap: space.x3, paddingTop: space.x3 }}>
            {v.priorEducation.map((x, i) => {
              const reversed = !!x.periodFrom && !!x.periodTo && x.periodFrom > x.periodTo;
              return (
                <EntryBlock
                  key={i}
                  title={`기관 ${i + 1}`}
                  action={
                    v.priorEducation.length > 1 && !locked ? (
                      <RowAction label="삭제" accessibilityLabel={`기관 ${i + 1} 삭제`} onPress={() => void removePrior(i)} />
                    ) : null
                  }>
                  <TextField
                    label="기관명"
                    value={x.institution}
                    onChangeText={(t) => setPrior(i, { institution: t })}
                    editable={!locked}
                    placeholder="예: 메가스터디, 김선생 과외"
                  />
                  <View style={{ gap: space.x2 }}>
                    <View style={TWO_COL}>
                      <View style={COL}>
                        <MonthField
                          label="시작 월"
                          value={x.periodFrom}
                          onChange={(periodFrom) => setPrior(i, { periodFrom })}
                          disabled={locked}
                        />
                      </View>
                      <View style={COL}>
                        <MonthField
                          label="종료 월"
                          value={x.periodTo}
                          onChange={(periodTo) => setPrior(i, { periodTo })}
                          disabled={locked}
                        />
                      </View>
                    </View>
                    {reversed && (
                      <Text variant="t3-regular" color="critical">
                        종료 월이 시작 월보다 빨라요. 다시 확인해 주세요.
                      </Text>
                    )}
                  </View>
                  <ChoiceField label="과목" indicator="여러 개 고를 수 있어요">
                    <MultiChips
                      options={S.HISTORY_SUBJECT_OPTIONS}
                      values={x.subjects}
                      onToggle={(o) => setPrior(i, { subjects: toggleIn(x.subjects, o) })}
                      disabled={locked}
                    />
                    {x.subjects.includes('기타') && (
                      <TextField
                        value={x.subjectOther ?? ''}
                        onChangeText={(t) => setPrior(i, { subjectOther: t })}
                        editable={!locked}
                        placeholder="기타 과목을 적어 주세요"
                        accessibilityLabel="기타 과목"
                      />
                    )}
                  </ChoiceField>
                  <ChoiceField label="형태">
                    <SingleChips
                      options={S.HISTORY_FORMAT_OPTIONS}
                      value={x.format}
                      onChange={(format) => setPrior(i, { format })}
                      disabled={locked}
                    />
                  </ChoiceField>
                  <TextField
                    label="그만둔 이유"
                    value={x.quitReason}
                    onChangeText={(t) => setPrior(i, { quitReason: t })}
                    editable={!locked}
                    placeholder="한 줄로 적어 주세요 (예: 효율이 낮았어요)"
                  />
                </EntryBlock>
              );
            })}
            {!locked && (
              <Button
                variant="weak"
                size="md"
                block
                icon={Plus}
                onPress={() => update((p) => ({ ...p, priorEducation: [...p.priorEducation, S.emptyPriorEducation()] }))}>
                기관 추가
              </Button>
            )}
          </View>
        )}
      </FormSection>

      <FormSection
        title="현재 학습 시간 분배"
        description="전체 공부 시간을 100%로 보고 나눠 주세요."
        aside={
          <Badge size="md" tone={sum === 100 ? 'ok' : 'warn'}>
            {`합계 ${sum}%`}
          </Badge>
        }>
        <View style={{ gap: space.x2 }}>
          {S.HISTORY_MIX_KEYS.map((k) => {
            const label = S.HISTORY_MIX_LABELS[k];
            return (
              <View key={k} style={s.mixRow}>
                <Text variant="t4-medium" color="neutralMuted" style={s.mixLabel}>
                  {label}
                </Text>
                <View style={COL}>
                  <PercentSlider
                    value={v.currentMix[k]}
                    onChange={(n) => setMix(k, n)}
                    disabled={locked}
                    accessibilityLabel={`${label} 비율`}
                  />
                </View>
                <View style={s.mixInput}>
                  <TextField
                    value={String(v.currentMix[k])}
                    onChangeText={(t) => setMix(k, Number(digitsOnly(t, 3)) || 0)}
                    editable={!locked}
                    keyboardType="number-pad"
                    selectTextOnFocus
                    accessibilityLabel={`${label} 비율 (%)`}
                    suffix={
                      <Text variant="t5-regular" color="neutralSubtle">
                        %
                      </Text>
                    }
                  />
                </View>
              </View>
            );
          })}
        </View>
        {sum !== 100 && (
          <Text variant="t3-regular" color={color.fg.warningContrast}>
            {`네 영역의 합이 정확히 100%가 되어야 해요. 지금 ${sum}%라서 ${
              sum < 100 ? `${100 - sum}%가 모자라요.` : `${sum - 100}%가 넘쳐요.`
            }`}
          </Text>
        )}
      </FormSection>

      <FormSection title="주로 공부하는 곳">
        <SingleChips
          options={S.HISTORY_PLACE_OPTIONS}
          value={v.studyPlace}
          onChange={(studyPlace) => update((p) => ({ ...p, studyPlace }))}
          disabled={locked}
        />
        {v.studyPlace === '기타' && (
          <TextField
            value={v.studyPlaceOther ?? ''}
            onChangeText={(t) => update((p) => ({ ...p, studyPlaceOther: t }))}
            editable={!locked}
            placeholder="기타 장소를 적어 주세요"
            accessibilityLabel="기타 학습 장소"
          />
        )}
      </FormSection>

      <FormSection title="이전 입시 컨설팅 경험" description="입시 컨설팅을 받아 본 적이 있나요?">
        <Segmented<'' | 'yes' | 'no'>
          options={YES_NO}
          value={pc.had}
          onChange={(had) => had && setConsultingHad(had)}
          disabled={locked}
        />
        {pc.had === 'yes' && (
          <View style={{ paddingTop: space.x3 }}>
            <View style={[s.entry, { paddingTop: space.x5, gap: space.x5 }]}>
              <TextField
                label="기관 · 컨설턴트"
                value={pc.institution}
                onChangeText={(t) => setConsulting({ institution: t })}
                editable={!locked}
                placeholder="컨설팅 기관이나 컨설턴트 이름"
              />
              <TextField
                label="이용 시기"
                value={pc.period}
                onChangeText={(t) => setConsulting({ period: t })}
                editable={!locked}
                placeholder="예: 2025년 6월~9월"
              />
              <ChoiceField label="만족도">
                <ScaleRating
                  label="만족도"
                  value={pc.satisfaction}
                  onChange={(n) => setConsulting({ satisfaction: n })}
                  low="낮음"
                  high="높음"
                  numbered={false}
                  disabled={locked}
                />
              </ChoiceField>
            </View>
          </View>
        )}
      </FormSection>
    </View>
  );
}

// ── goals ──

function GoalsEditor({ value: v, update, locked }: EditorProps<S.GoalsAnswer>) {
  const setAsp = (i: number, patch: Partial<S.Aspiration>) =>
    update((p) => ({ ...p, aspirations: p.aspirations.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));

  return (
    <View style={s.editor}>
      <LegacyNotice text={v.legacyText} />

      <FormSection title="희망 대학·학과" description="1지망부터 3지망까지 적어 주세요.">
        {v.aspirations.map((a, i) => (
          <EntryBlock key={i} title={S.ASPIRATION_LABELS[i] ?? `${i + 1}지망`}>
            <TextField
              label="대학"
              value={a.university}
              onChangeText={(t) => setAsp(i, { university: t })}
              editable={!locked}
              placeholder="예: 서울대학교"
            />
            <TextField
              label="학과"
              value={a.department}
              onChangeText={(t) => setAsp(i, { department: t })}
              editable={!locked}
              placeholder="예: 경영학과"
            />
            <ChoiceField label="지원 전형">
              <SingleChips
                options={S.GOALS_TRACK_OPTIONS}
                value={a.track}
                onChange={(track) => setAsp(i, { track })}
                disabled={locked}
              />
            </ChoiceField>
            <ChoiceField label="난이도 분류">
              <SingleChips
                options={S.GOALS_FIT_OPTIONS}
                value={a.fit}
                onChange={(fit) => setAsp(i, { fit })}
                disabled={locked}
              />
            </ChoiceField>
            <TextField
              label="고른 이유"
              value={a.reason}
              onChangeText={(t) => setAsp(i, { reason: t })}
              editable={!locked}
              multiline
              minHeight={96}
              placeholder="이 대학·학과를 고른 이유를 1–2줄로 적어 주세요"
            />
          </EntryBlock>
        ))}
      </FormSection>

      <FormSection title="우선순위" description="대학과 학과가 부딪치면 무엇을 먼저 볼까요?">
        <SingleChips
          options={S.GOALS_PRIORITY_AXIS_OPTIONS}
          value={v.priorityAxis}
          onChange={(priorityAxis) => update((p) => ({ ...p, priorityAxis }))}
          disabled={locked}
        />
      </FormSection>

      <FormSection title="진로 일치 여부" description="희망 학과가 생각하는 진로와 맞나요?">
        <Segmented<S.CareerAlignment>
          options={S.GOALS_CAREER_ALIGNMENT_OPTIONS}
          value={v.careerAlignment}
          onChange={(careerAlignment) => update((p) => ({ ...p, careerAlignment }))}
          disabled={locked}
        />
        {v.careerAlignment === 'undecided' && (
          <Notice tone="info" icon={Lightbulb}>
            진로가 아직 정해지지 않아도 괜찮아요. 컨설턴트가 학과 탐색부터 함께 잡아 드릴게요. 가능하면 관심 있는
            분야(이공계열, 인문사회, 예체능 등)를 위 지망 학과 칸에 적어 주세요.
          </Notice>
        )}
      </FormSection>
    </View>
  );
}

// ── admissionType ──

function AdmissionTypeEditor({
  value: v,
  update,
  locked,
  gradeNumber,
}: EditorProps<S.AdmissionTypeAnswer> & { gradeNumber: 1 | 2 | 3 | null }) {
  const classified = useMemo(() => S.classifyInternalSemesters(gradeNumber), [gradeNumber]);
  const visible = classified.filter((c) => c.status !== 'future');
  const hasFuture = classified.some((c) => c.status === 'future');

  // 수시 카드: 적은 카드 + 빈 카드 1장까지만 펼쳐 보여 주고, 나머지는 "카드 추가"로 연다 (데이터는 항상 6장)
  const lastFilled = v.cardStrategy.reduce((acc, c, i) => (S.isCardFilled(c) ? i : acc), -1);
  const [cardsShown, setCardsShown] = useState(() => Math.min(S.CARD_COUNT, Math.max(1, lastFilled + 1)));
  const shownCards = Math.min(S.CARD_COUNT, Math.max(cardsShown, lastFilled + 1));

  const setSemester = (sem: string, patch: Partial<S.InternalSemester>) =>
    update((p) => ({ ...p, internalGrades: p.internalGrades.map((g) => (g.semester === sem ? { ...g, ...patch } : g)) }));
  const setSemesterGrade = (sem: string, subject: string, val: string) =>
    update((p) => ({
      ...p,
      internalGrades: p.internalGrades.map((g) =>
        g.semester === sem ? { ...g, grades: { ...g.grades, [subject]: val } } : g,
      ),
    }));
  const setMock = (i: number, patch: Partial<S.MockExam>) =>
    update((p) => ({ ...p, mockGrades: p.mockGrades.map((m, j) => (j === i ? { ...m, ...patch } : m)) }));
  const setMockCell = (i: number, field: 'grades' | 'percentiles', subject: string, val: string) =>
    update((p) => ({
      ...p,
      mockGrades: p.mockGrades.map((m, j) => (j === i ? { ...m, [field]: { ...m[field], [subject]: val } } : m)),
    }));
  const setCard = (i: number, patch: Partial<S.AdmissionCard>) =>
    update((p) => ({ ...p, cardStrategy: p.cardStrategy.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));

  const internalInvalid = visible.some(({ semester }) => {
    const row = v.internalGrades.find((g) => g.semester === semester);
    return !!row && !row.unregistered && S.INTERNAL_SUBJECT_KEYS.some((k) => row.grades[k] && !S.isValidGrade(row.grades[k]));
  });

  return (
    <View style={s.editor}>
      <LegacyNotice text={v.legacyText} />

      <FormSection title="주력 전형">
        <SelectBoxGroup
          options={S.ADMISSION_PRIMARY_TRACK_OPTIONS}
          value={v.primaryTrack}
          onChange={(primaryTrack) => update((p) => ({ ...p, primaryTrack }))}
          disabled={locked}
        />
      </FormSection>

      <FormSection
        title="내신 등급"
        description={`${
          gradeNumber
            ? `고${gradeNumber} 기준으로 지금까지 진행한 학기만 보여요.`
            : '학년 정보가 없어서 5개 학기를 모두 보여요.'
        } 성적이 없는 학기는 ‘미등록’을 눌러 주세요.`}>
        {visible.map(({ semester, status }) => {
          const row = v.internalGrades.find((g) => g.semester === semester);
          if (!row) return null;
          const label = S.semesterLabel(semester);
          return (
            <EntryBlock
              key={semester}
              title={label}
              badge={status === 'ongoing' ? <Badge tone="warn">진행 중</Badge> : null}
              action={
                <CheckToggle
                  label="미등록"
                  checked={row.unregistered}
                  onChange={(unregistered) => setSemester(semester, { unregistered })}
                  disabled={locked}
                />
              }>
              <View style={s.gradeGrid}>
                {S.INTERNAL_SUBJECT_KEYS.map((k) => (
                  <View key={k} style={s.gradeCol}>
                    <Text variant="t3-medium" color="neutralSubtle" align="center" numberOfLines={1}>
                      {k}
                    </Text>
                    <GradeInput
                      value={row.grades[k] ?? ''}
                      onChange={(val) => setSemesterGrade(semester, k, val)}
                      mode="grade"
                      disabled={locked || row.unregistered}
                      accessibilityLabel={`${label} ${k} 등급`}
                    />
                  </View>
                ))}
              </View>
            </EntryBlock>
          );
        })}
        {internalInvalid && (
          <Text variant="t3-regular" color="critical">
            등급은 1~9 사이로 적어 주세요.
          </Text>
        )}
        {hasFuture && (
          <Text variant="t3-regular" color="neutralSubtle" style={{ paddingHorizontal: space.x1 }}>
            아직 시작하지 않은 학기는 보이지 않아요.
          </Text>
        )}
      </FormSection>

      <FormSection
        title="모의고사 등급"
        description="최근 3회 기준이에요. 회차 이름은 자유롭게 적고, 응시하지 않았다면 ‘미등록’을 눌러 주세요.">
        {v.mockGrades.map((m, i) => {
          const invalid =
            !m.unregistered &&
            S.MOCK_SUBJECT_KEYS.some(
              (k) =>
                (m.grades[k] && !S.isValidGrade(m.grades[k])) ||
                (m.percentiles[k] && !S.isValidPercentile(m.percentiles[k])),
            );
          return (
            <EntryBlock
              key={i}
              title={`${i + 1}회차`}
              action={
                <CheckToggle
                  label="미등록"
                  checked={m.unregistered}
                  onChange={(unregistered) => setMock(i, { unregistered })}
                  disabled={locked}
                />
              }>
              <TextField
                value={m.label}
                onChangeText={(label) => setMock(i, { label })}
                editable={!locked && !m.unregistered}
                placeholder="회차 이름 (예: 9월 모평)"
                accessibilityLabel={`${i + 1}회차 이름`}
              />
              {!m.unregistered && (
                <View style={{ gap: space.x2 }}>
                  <View style={s.mockRow}>
                    <View style={s.mockHead} />
                    {S.MOCK_SUBJECT_KEYS.map((k) => (
                      <Text key={k} variant="t3-medium" color="neutralSubtle" align="center" style={s.gradeCol} numberOfLines={1}>
                        {k}
                      </Text>
                    ))}
                  </View>
                  {(
                    [
                      ['grades', '등급', 'gradeInt'],
                      ['percentiles', '백분위', 'percentile'],
                    ] as const
                  ).map(([field, rowLabel, mode]) => (
                    <View key={field} style={s.mockRow}>
                      <Text
                        variant="t3-bold"
                        color="neutralMuted"
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        style={s.mockHead}>
                        {rowLabel}
                      </Text>
                      {S.MOCK_SUBJECT_KEYS.map((k) => (
                        <View key={k} style={s.gradeCol}>
                          <GradeInput
                            value={m[field][k] ?? ''}
                            onChange={(val) => setMockCell(i, field, k, val)}
                            mode={mode}
                            disabled={locked}
                            accessibilityLabel={`${i + 1}회차 ${k} ${rowLabel}`}
                          />
                        </View>
                      ))}
                    </View>
                  ))}
                  {invalid && (
                    <Text variant="t3-regular" color="critical">
                      등급은 1~9, 백분위는 0~100 사이로 적어 주세요.
                    </Text>
                  )}
                </View>
              )}
            </EntryBlock>
          );
        })}
      </FormSection>

      <FormSection title="수능 최저 충족 자신감">
        <SelectBoxGroup
          options={S.ADMISSION_CSAT_OPTIONS}
          value={v.csatMinimum}
          onChange={(csatMinimum) => update((p) => ({ ...p, csatMinimum }))}
          disabled={locked}
        />
      </FormSection>

      {v.primaryTrack !== '정시 단일' && (
        <FormSection
          title="수시 카드 전략"
          description="6장까지 적을 수 있어요. 아직 정하지 못한 칸은 비워 둬도 괜찮아요.">
          {v.cardStrategy.slice(0, shownCards).map((c, i) => (
            <EntryBlock
              key={i}
              title={`카드 ${i + 1}`}
              action={
                S.isCardFilled(c) && !locked ? (
                  <RowAction
                    label="비우기"
                    accessibilityLabel={`카드 ${i + 1} 비우기`}
                    onPress={() => setCard(i, S.emptyAdmissionCard())}
                  />
                ) : null
              }>
              <View style={TWO_COL}>
                <View style={COL}>
                  <TextField
                    value={c.university}
                    onChangeText={(university) => setCard(i, { university })}
                    editable={!locked}
                    placeholder="대학"
                    accessibilityLabel={`카드 ${i + 1} 대학`}
                  />
                </View>
                <View style={COL}>
                  <TextField
                    value={c.department}
                    onChangeText={(department) => setCard(i, { department })}
                    editable={!locked}
                    placeholder="학과"
                    accessibilityLabel={`카드 ${i + 1} 학과`}
                  />
                </View>
              </View>
              <View style={{ gap: space.x3 }}>
                <ChoiceLine label="전형">
                  <GridChoice
                    options={S.ADMISSION_CARD_TRACK_OPTIONS}
                    value={c.track}
                    onChange={(track) => setCard(i, { track })}
                    disabled={locked}
                    itemLabel={(o) => `카드 ${i + 1} 전형 ${o.label}`}
                  />
                </ChoiceLine>
                <ChoiceLine label="성향">
                  <GridChoice
                    options={S.ADMISSION_CARD_FIT_OPTIONS}
                    value={c.fit}
                    onChange={(fit) => setCard(i, { fit })}
                    disabled={locked}
                    itemLabel={(o) => `카드 ${i + 1} 성향 ${o.label}`}
                  />
                </ChoiceLine>
              </View>
            </EntryBlock>
          ))}
          {!locked && shownCards < S.CARD_COUNT && (
            <Button variant="weak" size="md" block icon={Plus} onPress={() => setCardsShown(shownCards + 1)}>
              {`카드 추가 (${shownCards}/${S.CARD_COUNT})`}
            </Button>
          )}
        </FormSection>
      )}

      <FormSection
        title="판단 근거"
        description="내신·모의고사 등급, 생기부 강점·약점, 수능 최저 등을 종합해 2~3줄로 적어 주세요.">
        <TextField
          value={v.rationale}
          onChangeText={(rationale) => update((p) => ({ ...p, rationale }))}
          editable={!locked}
          multiline
          minHeight={120}
          placeholder="자유롭게 적어 주세요"
          accessibilityLabel="판단 근거"
        />
      </FormSection>
    </View>
  );
}

function ChoiceLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={s.choiceLine}>
      <Text variant="t3-bold" color="neutralMuted" style={s.choiceLineLabel} numberOfLines={1}>
        {label}
      </Text>
      <View style={COL}>{children}</View>
    </View>
  );
}

// ── strengthsWeaknesses ──

function StrengthsWeaknessesEditor({ value: v, update, locked }: EditorProps<S.StrengthsWeaknessesAnswer>) {
  const setSubject = (i: number, patch: Partial<S.SubjectStrength>) =>
    update((p) => ({ ...p, bySubject: p.bySubject.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const removeSubject = async (i: number) => {
    if (!(await confirmRemove('이 과목을', hasContent(v.bySubject[i])))) return;
    update((p) => ({ ...p, bySubject: p.bySubject.filter((_, j) => j !== i) }));
  };
  const focus = Number(v.focusMinutes);
  const focusInvalid = v.focusMinutes.trim() !== '' && (!Number.isFinite(focus) || focus <= 0);

  return (
    <View style={s.editor}>
      <LegacyNotice text={v.legacyText} />

      <FormSection title="과목별 강·약" description="과목마다 수준과 약한 부분을 알려 주세요.">
        {v.bySubject.map((x, i) => (
          <EntryBlock
            key={i}
            title={`과목 ${i + 1}`}
            action={
              v.bySubject.length > 1 && !locked ? (
                <RowAction label="삭제" accessibilityLabel={`과목 ${i + 1} 삭제`} onPress={() => void removeSubject(i)} />
              ) : null
            }>
            <TextField
              value={x.subject}
              onChangeText={(t) => setSubject(i, { subject: t })}
              editable={!locked}
              placeholder="과목명 (예: 수학, 국어, 생명과학Ⅰ)"
              accessibilityLabel={`과목 ${i + 1} 이름`}
            />
            <ChoiceField label="강·중·약">
              <GridChoice
                options={S.SW_LEVEL_OPTIONS}
                value={x.level}
                onChange={(level) => setSubject(i, { level })}
                disabled={locked}
                itemLabel={(o) => `과목 ${i + 1} 수준 ${o.label}`}
              />
            </ChoiceField>
            <View style={TWO_COL}>
              <View style={COL}>
                <TextField
                  label="내신 등급"
                  value={x.internalGrade}
                  onChangeText={(t) => setSubject(i, { internalGrade: decimalOnly(t, 4) })}
                  editable={!locked}
                  keyboardType="decimal-pad"
                  placeholder="-"
                  errorMessage={x.internalGrade && !S.isValidGrade(x.internalGrade) ? '1~9 사이로 적어 주세요' : null}
                />
              </View>
              <View style={COL}>
                <TextField
                  label="모의 등급"
                  value={x.mockGrade}
                  onChangeText={(t) => setSubject(i, { mockGrade: digitsOnly(t, 1) })}
                  editable={!locked}
                  keyboardType="number-pad"
                  placeholder="-"
                  errorMessage={x.mockGrade && !S.isValidGrade(x.mockGrade) ? '1~9 사이로 적어 주세요' : null}
                />
              </View>
            </View>
            <ChoiceField label="약한 영역" indicator="모두 골라 주세요">
              <MultiChips
                options={S.SW_WEAK_AREA_OPTIONS}
                values={x.weakAreas}
                onToggle={(o) => setSubject(i, { weakAreas: toggleIn(x.weakAreas, o) })}
                disabled={locked}
              />
              {x.weakAreas.includes('기타') && (
                <TextField
                  value={x.weakAreaOther ?? ''}
                  onChangeText={(t) => setSubject(i, { weakAreaOther: t })}
                  editable={!locked}
                  placeholder="기타 약한 영역을 적어 주세요"
                  accessibilityLabel="기타 약한 영역"
                />
              )}
            </ChoiceField>
            <TextField
              label="이유"
              value={x.reason}
              onChangeText={(t) => setSubject(i, { reason: t })}
              editable={!locked}
              placeholder="한 줄로 (예: 개념 정리 부족, 기출 분석 안 함)"
            />
          </EntryBlock>
        ))}
        {!locked && (
          <Button
            variant="gray"
            size="md"
            block
            icon={Plus}
            onPress={() => update((p) => ({ ...p, bySubject: [...p.bySubject, S.emptySubjectStrength()] }))}>
            과목 추가
          </Button>
        )}
      </FormSection>

      <FormSection title="학습 습관" description="해당하는 걸 모두 골라 주세요.">
        <MultiChips
          options={S.SW_HABIT_OPTIONS}
          values={v.studyHabits}
          onToggle={(h) => update((p) => ({ ...p, studyHabits: toggleIn(p.studyHabits, h) }))}
          disabled={locked}
        />
      </FormSection>

      <FormSection title="평균 집중 가능 시간" description="한 번 앉으면 보통 몇 분 정도 집중할 수 있나요?">
        <TextField
          value={v.focusMinutes}
          onChangeText={(t) => update((p) => ({ ...p, focusMinutes: digitsOnly(t, 3) }))}
          editable={!locked}
          keyboardType="number-pad"
          placeholder="예: 45"
          accessibilityLabel="평균 집중 가능 시간(분)"
          errorMessage={focusInvalid ? '1분 이상으로 적어 주세요' : null}
          suffix={
            <Text variant="t5-regular" color="neutralSubtle">
              분
            </Text>
          }
        />
      </FormSection>

      <FormSection title="시험 불안도">
        <ScaleRating
          label="시험 불안도"
          value={v.testAnxiety}
          onChange={(n) => update((p) => ({ ...p, testAnxiety: n }))}
          low="낮음"
          high="높음"
          disabled={locked}
        />
      </FormSection>

      <FormSection title="자기주도 수준">
        <ScaleRating
          label="자기주도 수준"
          value={v.selfDirection}
          onChange={(n) => update((p) => ({ ...p, selfDirection: n }))}
          low="관리 필요"
          high="완전 자기주도"
          disabled={locked}
        />
      </FormSection>
    </View>
  );
}

const s = StyleSheet.create({
  dim: { opacity: 0.5 },
  spinner: { width: 14, height: 14, transform: [{ scale: 0.7 }] },
  saveIndicator: { flexDirection: 'row', alignItems: 'center', gap: space.x1, minHeight: space.x5 },
  editor: { gap: space.x10 },
  formHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.x3 },
  entry: {
    backgroundColor: color.bg.layerFill,
    borderRadius: radius.r4,
    paddingHorizontal: space.x4,
    paddingTop: space.x3,
    paddingBottom: space.x5,
  },
  entryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.x2,
    minHeight: space.x9,
    marginBottom: space.x3,
  },
  entryTitle: { flexDirection: 'row', alignItems: 'center', gap: space.x2, flexShrink: 1, minWidth: 0 },
  rowAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x1,
    minHeight: space.x9,
    paddingHorizontal: space.x2,
    marginRight: -space.x2,
    borderRadius: radius.r2,
  },
  grid: { flexDirection: 'row', gap: space.x2 },
  gridItem: {
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.x1,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: color.stroke.neutralMuted,
    backgroundColor: color.bg.layerDefault,
  },
  gridItemOn: { backgroundColor: color.bg.neutralInverted, borderColor: color.bg.neutralInverted },
  selectBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    minHeight: 56,
    paddingVertical: space.x3,
    paddingHorizontal: space.x4,
    borderRadius: radius.r3,
    borderWidth: 1,
    borderColor: color.stroke.neutralWeak,
    backgroundColor: color.bg.layerDefault,
  },
  selectBoxOn: { borderWidth: 2, borderColor: color.stroke.neutralContrast, paddingHorizontal: space.x4 - 1 },
  selectBoxDisabled: { backgroundColor: color.bg.disabled },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: color.stroke.neutralWeak,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: color.bg.neutralInverted, backgroundColor: color.bg.neutralInverted },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.palette.staticWhite },
  check: { flexDirection: 'row', alignItems: 'center', gap: space.x2, minHeight: space.x9 },
  checkBox: {
    width: 20,
    height: 20,
    borderRadius: radius.r1_5,
    borderWidth: 2,
    borderColor: color.stroke.neutralWeak,
    backgroundColor: color.bg.layerDefault,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBoxOn: { backgroundColor: color.bg.neutralInverted, borderColor: color.bg.neutralInverted },
  scaleEnds: { flexDirection: 'row', justifyContent: 'space-between', gap: space.x3, paddingHorizontal: space.x1 },
  slider: { height: 44, justifyContent: 'center' },
  sliderTrack: {
    position: 'absolute',
    left: THUMB / 2,
    right: THUMB / 2,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: color.palette.gray400,
  },
  sliderRange: {
    position: 'absolute',
    left: THUMB / 2,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: color.bg.neutralInverted,
  },
  sliderThumb: {
    position: 'absolute',
    top: (44 - THUMB) / 2,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: color.palette.staticWhite,
    borderWidth: 1,
    borderColor: color.stroke.neutralMuted,
    ...shadow('s2'),
  },
  mixRow: { flexDirection: 'row', alignItems: 'center', gap: space.x3 },
  mixLabel: { width: 60, flexShrink: 0 },
  mixInput: { width: 92, flexShrink: 0 },
  fieldBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x2,
    minHeight: 52,
    paddingHorizontal: space.x4,
    borderRadius: radius.r3,
    borderWidth: 1,
    borderColor: color.stroke.neutralWeak,
    backgroundColor: color.bg.layerDefault,
  },
  gradeGrid: { flexDirection: 'row', gap: space.x1_5 },
  gradeCol: { flex: 1, minWidth: 0, gap: space.x1_5 },
  gradeInput: {
    height: 44,
    paddingHorizontal: space.x1,
    paddingVertical: 0,
    borderRadius: radius.r2_5,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  mockRow: { flexDirection: 'row', alignItems: 'center', gap: space.x1_5 },
  mockHead: { width: 44, flexShrink: 0 },
  choiceLine: { flexDirection: 'row', alignItems: 'center', gap: space.x3 },
  choiceLineLabel: { minWidth: space.x8, flexShrink: 0 },
});
