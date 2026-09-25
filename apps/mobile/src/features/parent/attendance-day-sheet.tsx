import { View } from 'react-native';

import { Badge, BottomSheet, Button, Divider, InfoRow, Text, space } from '@/design';
import type { ParentDay } from '@/lib/api/parent-today';

import { dayMark, dayTitle, duration } from './today-format';
import { DayTimeline, buildTimeline } from './today-timeline';

/** 달력에서 고른 날의 상세 — 입실·외출·퇴실 시각(예정 대비)과 공부 시간 */
export function AttendanceDaySheet({
  open,
  onClose,
  date,
  day,
  today,
  now,
}: {
  open: boolean;
  onClose: () => void;
  date: string | null;
  day: ParentDay | null;
  today: string;
  now?: string;
}) {
  const mark = day ? dayMark(day) : null;
  const live = date === today;
  const outingCount = day?.outings.filter((o) => !o.planned).length ?? 0;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={date ? dayTitle(date) : undefined}
      description={
        mark ? (
          <View style={{ flexDirection: 'row', gap: space.x1_5, flexWrap: 'wrap' }}>
            <Badge tone={mark.tone} size="md">
              {mark.label}
            </Badge>
            {day?.isLate && day.lateMinutes ? (
              <Badge tone="warn" size="md">
                {`${day.lateMinutes}분 늦게 입실`}
              </Badge>
            ) : null}
          </View>
        ) : undefined
      }
      footer={
        <View style={{ flex: 1 }}>
          <Button variant="gray" size="lg" block onPress={onClose}>
            닫기
          </Button>
        </View>
      }>
      {day ? (
        <View style={{ gap: space.x4 }}>
          <DayTimeline events={buildTimeline(day, { live, now })} />
          {day.status !== '결석' && (
            <>
              <Divider />
              <View>
                <InfoRow label="공부 시간">
                  <Text variant="t5-bold" tabular>
                    {day.studyMinutes > 0 ? duration(day.studyMinutes) : '—'}
                  </Text>
                </InfoRow>
                <InfoRow label="외출">{outingCount > 0 ? `${outingCount}번` : '없음'}</InfoRow>
              </View>
              <Text variant="t3-regular" color="neutralSubtle">
                공부 시간은 입실부터 퇴실까지에서 외출한 시간을 뺀 값이에요.
              </Text>
            </>
          )}
        </View>
      ) : (
        <Text variant="t5-regular" color="neutralMuted" style={{ paddingVertical: space.x4 }}>
          {date && date === today
            ? '아직 오늘 출결 기록이 없어요.'
            : '이날은 출결 기록이 없어요. 등원하지 않는 날이었을 수 있어요.'}
        </Text>
      )}
    </BottomSheet>
  );
}
