import {
  AlarmClock,
  BookOpen,
  CalendarX,
  Clock,
  Footprints,
  House,
  type LucideIcon,
} from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Avatar, Badge, IconTile, Notice, StatGrid, Text, color, radius, space, type Tone } from '@/design';
import type { ParentTodayResponse } from '@/lib/api/parent-today';
import { childMeta } from '@/lib/parent-child';

import { duration, hm } from './today-format';

type HeroCopy = { icon: LucideIcon; tone: Tone; badge: string; title: string; lines: string[] };

function heroCopy(t: ParentTodayResponse): HeroCopy {
  const checkIn = hm(t.checkIn);
  const checkOut = hm(t.checkOut);

  if (t.status === '결석') {
    const label = t.typeLabel ?? '결석';
    return {
      icon: CalendarX,
      tone: t.type === 'ABSENT' ? 'bad' : 'gray',
      badge: label,
      title: t.type === 'ABSENT' ? '오늘은 결석했어요' : `오늘은 ${label}이에요`,
      lines: [t.type === 'ABSENT' ? '궁금한 점은 독서실로 연락해 주세요' : '미리 확인된 결석이에요'],
    };
  }
  if (t.status === '외출') {
    const active = t.outings.find((o) => o.status === '외출중');
    const start = hm(active?.start);
    return {
      icon: Footprints,
      tone: 'info',
      badge: '외출 중',
      title: '잠깐 외출 중이에요',
      lines: [
        [start ? `${start}에 나갔어요` : null, active?.reason].filter(Boolean).join(' · '),
        active?.expectedEnd ? `${active.expectedEnd}에 돌아올 예정이에요` : '',
      ].filter(Boolean),
    };
  }
  if (t.status === '입실') {
    return {
      icon: BookOpen,
      tone: 'ok',
      badge: '공부 중',
      title: '지금 독서실에서 공부 중이에요',
      lines: [
        checkIn ? `${checkIn}에 입실했어요` : '',
        `지금까지 ${duration(t.studyMinutes)} 공부했어요`,
      ].filter(Boolean),
    };
  }
  if (t.status === '퇴실') {
    return {
      icon: House,
      tone: 'gray',
      badge: '퇴실',
      title: '오늘 공부를 마치고 퇴실했어요',
      lines: [
        [checkIn && `${checkIn} 입실`, checkOut && `${checkOut} 퇴실`].filter(Boolean).join(' · '),
        `오늘 ${duration(t.studyMinutes)} 공부했어요`,
      ].filter(Boolean),
    };
  }
  // 미입실
  return {
    icon: t.overdue ? AlarmClock : Clock,
    tone: t.overdue ? 'warn' : 'gray',
    badge: '입실 전',
    title: '아직 입실 전이에요',
    lines: [
      t.expected.start
        ? `오늘 입실 예정 시간은 ${t.expected.start}이에요`
        : t.scheduled
          ? '오늘은 자율 등원하는 날이에요'
          : '오늘은 정해진 등원 일정이 없어요',
    ],
  };
}

/** 홈 맨 위 — 자녀 이름 + 지금 상태를 큰 글씨로 + 입실·퇴실·공부 시간 요약 */
export function TodayHero({ today }: { today: ParentTodayResponse }) {
  const copy = heroCopy(today);
  const checkIn = hm(today.checkIn);
  const checkOut = hm(today.checkOut);
  const absent = today.status === '결석';

  return (
    <View style={s.card}>
      <View style={s.childRow}>
        <Avatar name={today.child.name} size={44} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="t6-bold" numberOfLines={1}>
            {today.child.name}
          </Text>
          <Text variant="t4-regular" color="neutralSubtle" numberOfLines={1}>
            {childMeta(today.child)}
          </Text>
        </View>
        <Badge tone={copy.tone} size="md">
          {copy.badge}
        </Badge>
      </View>

      <View style={s.statusRow} accessible accessibilityRole="summary" accessibilityLabel={[copy.title, ...copy.lines].join('. ')}>
        <IconTile icon={copy.icon} tone={copy.tone} size={56} round />
        <View style={{ flex: 1, minWidth: 0, gap: space.x1 }}>
          <Text variant="t8-bold">{copy.title}</Text>
          {copy.lines.map((line) => (
            <Text key={line} variant="t5-regular" color="neutralMuted">
              {line}
            </Text>
          ))}
          {today.isLate && (
            <Badge tone="warn" size="md" style={{ marginTop: space.x1 }}>
              {today.lateMinutes ? `오늘 ${today.lateMinutes}분 지각했어요` : '오늘 지각했어요'}
            </Badge>
          )}
        </View>
      </View>

      {today.overdue && (
        <Notice tone="warn" icon={AlarmClock}>
          입실 예정 시간이 30분 넘게 지났어요. 걱정되시면 독서실로 연락해 주세요.
        </Notice>
      )}

      {!absent && (
        <StatGrid
          items={[
            {
              label: '입실',
              value: checkIn ?? '—',
              sub: today.expected.start ? `예정 ${today.expected.start}` : undefined,
              tone: today.isLate ? 'warning' : 'neutral',
            },
            {
              label: '퇴실',
              value: checkOut ?? '—',
              sub: today.expected.end ? `예정 ${today.expected.end}` : undefined,
            },
            {
              label: '오늘 공부',
              value: today.studyMinutes > 0 ? duration(today.studyMinutes) : '—',
              tone: today.studyMinutes > 0 ? 'brand' : 'neutral',
            },
          ]}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: color.bg.layerDefault,
    borderRadius: radius.r5,
    padding: space.x5,
    gap: space.x5,
  },
  childRow: { flexDirection: 'row', alignItems: 'center', gap: space.x3 },
  statusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.x4 },
});
