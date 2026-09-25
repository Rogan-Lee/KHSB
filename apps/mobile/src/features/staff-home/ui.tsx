import type { Href } from 'expo-router';
import { Circle, CircleCheck, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Badge,
  IconTile,
  Press,
  Section,
  Skeleton,
  Stack,
  Text,
  color,
  radius,
  space,
  type Tone,
} from '@/design';
import type { CalendarEventView, MentorShift } from '@/lib/api/staff-home';

// 직원 홈·일정·점심·인수인계 화면이 같이 쓰는 작은 조각들 (SEED 키트 위에 조립).

// ─── 바로가기 타일 ───────────────────────────────────────────────────

export type Shortcut = {
  key: string;
  label: string;
  icon: LucideIcon;
  tone: Tone;
  href: Href;
  /** 0 보다 크면 점 배지 */
  badge?: number;
};

/** 웹 학생 포털 ShortcutTile 과 같은 모양 — 48 아이콘 타일 + 작은 이름, 한 줄에 columns 개 */
export function ShortcutGrid({ items, columns = 4 }: { items: Shortcut[]; columns?: number }) {
  return (
    <View style={s.grid}>
      {items.map((it) => (
        // Press 의 style 은 안쪽 뷰에 붙으므로 칸 너비는 바깥 View 가 잡는다
        <View key={it.key} style={{ width: `${100 / columns}%` as `${number}%` }}>
          <Press
            href={it.href}
            scale={0.94}
            accessibilityLabel={it.badge ? `${it.label}, 새 항목 있음` : it.label}
            style={s.tile}>
            <View>
              <IconTile icon={it.icon} tone={it.tone} size={48} />
              {(it.badge ?? 0) > 0 && <View style={s.tileDot} />}
            </View>
            <Text variant="t3-medium" color="neutralMuted" numberOfLines={1} align="center">
              {it.label}
            </Text>
          </Press>
        </View>
      ))}
    </View>
  );
}

// ─── 좌석 타일 ──────────────────────────────────────────────────────

export function SeatTile({ seat, tone = 'gray' }: { seat: string | null; tone?: Tone }) {
  const bg = tone === 'ok' ? color.bg.positiveWeak : color.bg.neutralWeak;
  const fg = tone === 'ok' ? color.fg.positive : color.fg.neutralMuted;
  return (
    <View style={[s.seat, { backgroundColor: bg }]} accessibilityLabel={seat ? `좌석 ${seat}` : '좌석 없음'}>
      <Text variant={seat && seat.length > 3 ? 't2-bold' : 't4-bold'} color={fg} tabular numberOfLines={1}>
        {seat || '—'}
      </Text>
    </View>
  );
}

// ─── 일정 ──────────────────────────────────────────────────────────

const EVENT_DOT: Record<string, string> = {
  gray: color.palette.gray600,
  red: color.palette.red600,
  orange: color.palette.carrot500,
  yellow: color.palette.yellow400,
  green: color.palette.green500,
  blue: color.palette.blue600,
  purple: color.palette.purple600,
  pink: color.palette.red400,
  brown: color.palette.yellow700,
  google: color.palette.blue600,
};

export const EVENT_TYPE_TONE: Record<CalendarEventView['type'], Tone> = {
  SCHOOL_EXAM: 'bad',
  SCHOOL_EVENT: 'info',
  PERSONAL: 'gray',
  PLATFORM: 'brand',
};

function eventTimeLabel(e: CalendarEventView, dayKey?: string) {
  if (e.startDate !== e.endDate && dayKey) {
    if (dayKey !== e.startDate && dayKey !== e.endDate) return '종일';
    if (dayKey === e.endDate && dayKey !== e.startDate) return e.endTime ? `~${e.endTime}` : '종일';
  }
  if (e.allDay || !e.startTime) return '종일';
  return e.startTime;
}

/** 일정 한 줄 — 시간 칸 · 색 점 · 제목 · 종류/대상 */
export function EventRow({ event, dayKey }: { event: CalendarEventView; dayKey?: string }) {
  const who = [event.studentName, event.schoolName].filter(Boolean).join(' · ');
  const multi = event.startDate !== event.endDate;
  return (
    <View style={s.event} accessible accessibilityLabel={`${eventTimeLabel(event, dayKey)} ${event.title}`}>
      <Text variant="t4-medium" color="neutralSubtle" tabular style={s.eventTime} numberOfLines={1}>
        {eventTimeLabel(event, dayKey)}
      </Text>
      <View style={[s.eventDot, { backgroundColor: EVENT_DOT[event.color ?? 'blue'] ?? EVENT_DOT.blue }]} />
      <View style={{ flex: 1, minWidth: 0, gap: space.x0_5 }}>
        <Text variant="t5-medium" numberOfLines={2}>
          {event.title}
        </Text>
        <View style={s.eventMeta}>
          <Badge tone={EVENT_TYPE_TONE[event.type]}>{event.typeLabel}</Badge>
          {multi && <Badge>{`~${event.endDate.slice(5).replace('-', '/')}`}</Badge>}
          {who !== '' && (
            <Text variant="t3-regular" color="neutralSubtle" numberOfLines={1} style={{ flexShrink: 1 }}>
              {who}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

/** 근무 멘토 — 이름·시간 칩 묶음 (본인은 강조) */
export function MentorShiftList({ mentors }: { mentors: MentorShift[] }) {
  return (
    <View style={s.shiftWrap}>
      {mentors.map((m) => (
        <View
          key={`${m.mentorId}-${m.timeStart}`}
          style={[s.shift, m.isMe && { backgroundColor: color.bg.brandWeak }]}
          accessibilityLabel={`${m.name} ${m.timeStart}부터 ${m.timeEnd}까지${m.isMe ? ', 나' : ''}`}>
          <Text variant="t4-bold" color={m.isMe ? 'brand' : 'neutral'} numberOfLines={1}>
            {m.name}
            {m.isMe ? ' (나)' : ''}
          </Text>
          <Text variant="t3-regular" color={m.isMe ? 'brand' : 'neutralSubtle'} tabular>
            {m.timeStart}–{m.timeEnd}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ─── 체크 행 (할 일·체크리스트) ────────────────────────────────────

export function CheckRow({
  checked,
  onPress,
  title,
  description,
  meta,
  disabled,
  inset = true,
}: {
  checked: boolean;
  onPress: () => void;
  title: string;
  description?: ReactNode;
  meta?: ReactNode;
  disabled?: boolean;
  /** true: 흰 카드 안 인셋 눌림 영역(ListRow 와 같은 여백) · false: 회색 상자 안 꽉 찬 행 */
  inset?: boolean;
}) {
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      scale={0}
      pressedBg
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={title}
      style={[s.check, inset ? s.checkInset : s.checkFlat, disabled && { opacity: 0.6 }]}>
      {checked ? (
        <CircleCheck color={color.fg.positive} size={24} strokeWidth={2.2} fill={color.bg.positiveWeak} />
      ) : (
        <Circle color={color.palette.gray500} size={24} strokeWidth={2} />
      )}
      <View style={{ flex: 1, minWidth: 0, gap: space.x0_5 }}>
        {meta != null && <View style={s.eventMeta}>{meta}</View>}
        <Text
          variant="t5-medium"
          color={checked ? 'neutralSubtle' : 'neutral'}
          style={checked ? { textDecorationLine: 'line-through' } : undefined}>
          {title}
        </Text>
        {description != null &&
          (typeof description === 'string' ? (
            <Text variant="t3-regular" color="neutralSubtle">
              {description}
            </Text>
          ) : (
            description
          ))}
      </View>
    </Press>
  );
}

// ─── 스켈레톤 ──────────────────────────────────────────────────────

/** 흰 카드 안 목록 모양 스켈레톤 */
export function ListSkeleton({ rows = 3, title = true }: { rows?: number; title?: boolean }) {
  return (
    <Section>
      <Stack gap={space.x4}>
        {title && <Skeleton style={{ width: 120, height: 22 }} />}
        {Array.from({ length: rows }, (_, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: space.x3, alignItems: 'center' }}>
            <Skeleton style={{ width: 40, height: 40, borderRadius: radius.r3 }} />
            <View style={{ flex: 1, gap: space.x1_5 }}>
              <Skeleton style={{ width: '60%', height: 16 }} />
              <Skeleton style={{ width: '40%', height: 13 }} />
            </View>
          </View>
        ))}
      </Stack>
    </Section>
  );
}

/** 요약 숫자 칸 스켈레톤 */
export function StatSkeleton() {
  return (
    <Section>
      <Stack gap={space.x4}>
        <Skeleton style={{ width: 100, height: 22 }} />
        <Skeleton style={{ height: 76, borderRadius: radius.r4 }} />
      </Stack>
    </Section>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.x4 },
  tile: { alignItems: 'center', gap: space.x2, paddingHorizontal: space.x1, minHeight: 76 },
  tileDot: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: color.bg.brandSolid,
    borderWidth: 2,
    borderColor: color.bg.layerDefault,
  },
  seat: {
    width: 44,
    height: 44,
    borderRadius: radius.r3,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.x1,
  },
  event: { flexDirection: 'row', alignItems: 'flex-start', gap: space.x3, paddingVertical: space.x2_5 },
  eventTime: { width: 44, paddingTop: 1 },
  eventDot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
  eventMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.x1 },
  shiftWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.x2 },
  shift: {
    paddingHorizontal: space.x3,
    paddingVertical: space.x2,
    borderRadius: radius.r3,
    backgroundColor: color.bg.layerFill,
    gap: space.x0_5,
  },
  check: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    minHeight: 48,
    paddingVertical: space.x2_5,
    borderRadius: radius.r4,
  },
  checkInset: { marginHorizontal: space.x2, paddingHorizontal: space.x3 },
  checkFlat: { paddingHorizontal: space.x4, borderRadius: 0 },
});
