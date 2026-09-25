import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import {
  BottomSheet,
  Button,
  Chip,
  ChipGroup,
  color,
  Press,
  Segmented,
  space,
  Text,
  TextField,
  toast,
} from '@/design';
import { requestMobileApi } from '@/lib/mobile-api';
import { createMerit, type MeritItem, type MeritType, type OpsMeritsResponse } from '@/lib/api/staff-ops';

import { FooterSlot, useSheetSession } from './attendance-controls';
import { formatDateKey, shiftDateKey, todayKstKey } from './status';

const POINT_PRESETS = [1, 2, 3, 5];
const MAX_BACK_DAYS = 30;

// 자주 쓰는 사유·카테고리 — 앱 실행 동안 한 번만 불러온다
let hintsCache: Pick<OpsMeritsResponse, 'categories' | 'recentReasons'> | null = null;

function useMeritHints(enabled: boolean) {
  const [hints, setHints] = useState(hintsCache);
  useEffect(() => {
    if (!enabled || hintsCache) return;
    let active = true;
    requestMobileApi<OpsMeritsResponse>('/api/mobile/v1/staff/merits')
      .then((res) => {
        hintsCache = { categories: res.categories, recentReasons: res.recentReasons };
        if (active) setHints(hintsCache);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [enabled]);
  return hints ?? hintsCache;
}

/**
 * 상벌점 빠른 입력 — 상점/벌점 · 점수 칩 · 사유(자주 쓰는 사유) · 카테고리 · 날짜.
 */
export function MeritSheet({
  student,
  open,
  onClose,
  onSaved,
  initialType = 'MERIT',
}: {
  student: { id: string; name: string; seat?: string | null } | null;
  open: boolean;
  onClose: () => void;
  onSaved?: (item: MeritItem) => void;
  initialType?: MeritType;
}) {
  const hints = useMeritHints(open);
  const [type, setType] = useState<MeritType>(initialType);
  const [points, setPoints] = useState<number | 'custom'>(1);
  const [customPoints, setCustomPoints] = useState('');
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [date, setDate] = useState(todayKstKey());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useSheetSession(open, student ? `${student.id}:${initialType}` : null, () => {
    setType(initialType);
    setPoints(1);
    setCustomPoints('');
    setReason('');
    setCategory(null);
    setDate(todayKstKey());
    setError(null);
  });

  const today = todayKstKey();
  const minDate = shiftDateKey(today, -MAX_BACK_DAYS);
  const value = points === 'custom' ? Number(customPoints) : points;
  const validPoints = Number.isInteger(value) && value >= 1 && value <= 100;
  const label = type === 'MERIT' ? '상점' : '벌점';
  const reasons = hints?.recentReasons[type] ?? [];

  const submit = async () => {
    if (saving || !student) return;
    if (!validPoints) {
      setError('점수는 1~100 사이 정수로 입력해 주세요');
      return;
    }
    if (!reason.trim()) {
      setError('사유를 입력해 주세요');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const { item } = await createMerit({
        studentId: student.id,
        type,
        points: value,
        reason: reason.trim(),
        category,
        date,
      });
      toast(`${student.name} 학생에게 ${label} ${value}점을 줬어요`, 'success');
      onSaved?.(item);
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : '저장하지 못했어요', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      open={open && !!student}
      onClose={onClose}
      title="상벌점 주기"
      description={student ? `${student.name}${student.seat ? ` · 좌석 ${student.seat}` : ''}` : undefined}
      footer={
        <>
          <FooterSlot>
            <Button variant="gray" block onPress={onClose} disabled={saving}>
              취소
            </Button>
          </FooterSlot>
          <FooterSlot>
            <Button
              block
              variant={type === 'MERIT' ? 'primary' : 'danger'}
              loading={saving}
              disabled={!validPoints || !reason.trim()}
              onPress={() => void submit()}>
              {validPoints ? `${label} ${value}점 주기` : `${label} 주기`}
            </Button>
          </FooterSlot>
        </>
      }>
      <Segmented
        options={[
          { value: 'MERIT' as const, label: '상점' },
          { value: 'DEMERIT' as const, label: '벌점' },
        ]}
        value={type}
        onChange={setType}
      />

      <View style={{ gap: space.x2, paddingTop: space.x1 }}>
        <Text variant="t5-medium">점수</Text>
        <ChipGroup>
          {POINT_PRESETS.map((p) => (
            <Chip key={p} size="lg" selected={points === p} onPress={() => setPoints(p)}>
              {`${p}점`}
            </Chip>
          ))}
          <Chip size="lg" selected={points === 'custom'} onPress={() => setPoints('custom')}>
            직접 입력
          </Chip>
        </ChipGroup>
        {points === 'custom' && (
          <TextField
            value={customPoints}
            onChangeText={(v) => setCustomPoints(v.replace(/\D/g, '').slice(0, 3))}
            placeholder="점수"
            keyboardType="number-pad"
            maxLength={3}
            autoFocus
            accessibilityLabel="점수 직접 입력"
            suffix={
              <Text variant="t5-regular" color="neutralSubtle">
                점
              </Text>
            }
            errorMessage={customPoints && !validPoints ? '1~100 사이로 입력해 주세요' : null}
          />
        )}
      </View>

      <View style={{ gap: space.x2, paddingTop: space.x1 }}>
        <TextField
          label="사유"
          value={reason}
          onChangeText={setReason}
          placeholder={type === 'MERIT' ? '예: 자습 태도가 좋아요' : '예: 자습 중 휴대폰 사용'}
          maxLength={200}
        />
        {reasons.length > 0 && (
          <ChipGroup>
            {reasons.slice(0, 6).map((r) => (
              <Chip key={r} size="sm" selected={reason.trim() === r} onPress={() => setReason(r)}>
                {r}
              </Chip>
            ))}
          </ChipGroup>
        )}
      </View>

      {hints && hints.categories.length > 0 && (
        <View style={{ gap: space.x2, paddingTop: space.x1 }}>
          <Text variant="t5-medium">
            카테고리
            <Text variant="t4-regular" color="neutralSubtle">
              {'  '}선택
            </Text>
          </Text>
          <ChipGroup>
            {hints.categories.map((c) => (
              <Chip
                key={c}
                size="sm"
                selected={category === c}
                onPress={() => setCategory(category === c ? null : c)}>
                {c}
              </Chip>
            ))}
          </ChipGroup>
        </View>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: space.x1 }}>
        <Text variant="t5-medium" style={{ flex: 1 }}>
          날짜
        </Text>
        <DateStepper value={date} min={minDate} max={today} onChange={setDate} />
      </View>

      {error && (
        <Text variant="t4-regular" color="critical">
          {error}
        </Text>
      )}
    </BottomSheet>
  );
}

/** ‹ 9월 25일 (목) › — 하루씩 이동 */
export function DateStepper({
  value,
  min,
  max,
  onChange,
}: {
  value: string;
  min?: string;
  max?: string;
  onChange: (v: string) => void;
}) {
  const canPrev = !min || value > min;
  const canNext = !max || value < max;
  const isToday = value === todayKstKey();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x1 }}>
      <StepButton icon="prev" disabled={!canPrev} onPress={() => onChange(shiftDateKey(value, -1))} />
      <View style={{ minWidth: 112, alignItems: 'center' }}>
        <Text variant="t5-bold" tabular>
          {isToday ? `오늘 · ${formatDateKey(value, false)}` : formatDateKey(value)}
        </Text>
      </View>
      <StepButton icon="next" disabled={!canNext} onPress={() => onChange(shiftDateKey(value, 1))} />
    </View>
  );
}

function StepButton({
  icon,
  disabled,
  onPress,
}: {
  icon: 'prev' | 'next';
  disabled: boolean;
  onPress: () => void;
}) {
  const Icon = icon === 'prev' ? ChevronLeft : ChevronRight;
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      scale={0}
      pressedBg
      accessibilityLabel={icon === 'prev' ? '하루 전' : '하루 뒤'}
      style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}>
      <Icon color={disabled ? color.fg.disabled : color.fg.neutral} size={22} strokeWidth={2.2} />
    </Press>
  );
}
