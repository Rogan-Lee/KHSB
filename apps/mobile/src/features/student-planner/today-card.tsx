import type { Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { color, ProgressBar, radius, Section, SectionAction, space, Text } from '@/design';
import { dotColor } from '@/features/student-plan/format';
import { plansPath, type PlansRangeResponse } from '@/lib/api/student-plan';
import { useMobileQuery } from '@/lib/mobile-api';

import { fmtMinutes, kstToday, ordered, progressOf } from './planner';

export const PLANNER_ROUTE = '/(student)/planner' as Href;

const MAX_ROWS = 3;

/** 학생 홈 — 오늘 공부 계획 요약 (남은 할 일 3개까지). 화면에 돌아오면 다시 읽는다(useMobileQuery). */
export function TodayPlanCard() {
  const today = kstToday();
  const { data } = useMobileQuery<PlansRangeResponse>(plansPath(today, today));
  const items = data?.days[0]?.items ?? [];
  const prog = progressOf(items);
  const left = ordered(items).filter((it) => !it.done);

  return (
    <Section
      title="오늘 공부 계획"
      description={
        !data
          ? ' '
          : prog.total === 0
            ? '오늘 할 일을 적어 보세요'
            : prog.done === prog.total
              ? `${prog.total}개 모두 끝냈어요`
              : `${prog.total}개 중 ${prog.done}개 완료${prog.minutes ? ` · 목표 ${fmtMinutes(prog.minutes)}` : ''}`
      }
      action={<SectionAction href={PLANNER_ROUTE}>{prog.total === 0 ? '계획 세우기' : '플래너'}</SectionAction>}>
      {prog.total > 0 && (
        <View style={{ gap: space.x3 }}>
          <ProgressBar value={prog.ratio} tone={prog.ratio === 1 ? 'ok' : 'brand'} />
          {left.slice(0, MAX_ROWS).map((it) => (
            <View key={it.id} style={s.row}>
              <View style={s.box} />
              {it.subject ? <View style={[s.dot, { backgroundColor: dotColor(it.colorCode) }]} /> : null}
              <Text variant="t4-regular" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                {it.text}
              </Text>
            </View>
          ))}
          {left.length > MAX_ROWS && (
            <Text variant="t3-regular" color="neutralSubtle">
              외 {left.length - MAX_ROWS}개
            </Text>
          )}
        </View>
      )}
    </Section>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.x2_5 },
  box: {
    width: 18,
    height: 18,
    borderRadius: radius.r1,
    borderWidth: 1.5,
    borderColor: color.stroke.neutralMuted,
  },
  dot: { width: 8, height: 8, borderRadius: radius.full },
});
