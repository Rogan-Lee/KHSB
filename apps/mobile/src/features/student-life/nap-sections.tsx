import { Moon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import {
  Badge,
  color,
  EmptyState,
  IconTile,
  ListRow,
  Notice,
  ProgressBar,
  radius,
  Section,
  Segmented,
  Skeleton,
  space,
  Text,
} from '@/design';
import { REQUEST_STATUS, type NapRequest } from '@/lib/api/student-life';

import { fmtDateDow } from './format';
import { TimeField } from './time-field';
import { Field, SkeletonCard, SkeletonRow } from './ui';

// 웹 학생 포털 /s/[token]/nap (nap-panel.tsx) 와 같은 카드·문구·배지 규칙.

/** 오늘 남은 횟수 */
export function NapQuotaCard({
  remaining,
  limit,
  todayCount,
}: {
  remaining: number;
  limit: number;
  todayCount: number;
}) {
  return (
    <Section>
      <View style={s.quotaHead}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="t4-bold" color="neutralMuted">
            오늘 남은 쪽잠
          </Text>
          <Text
            variant="t11-bold"
            tabular
            style={{ marginTop: space.x1 }}
            accessibilityLabel={`오늘 남은 쪽잠 ${remaining}회, 하루 ${limit}회`}>
            {remaining}회
            <Text variant="t6-bold" color="placeholder" tabular>
              {` / ${limit}회`}
            </Text>
          </Text>
        </View>
        <IconTile icon={Moon} tone="violet" size={48} round />
      </View>

      {limit > 0 && limit <= 8 ? (
        <View style={s.segments} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {Array.from({ length: limit }, (_, i) => (
            <View
              key={i}
              style={[s.segment, { backgroundColor: i < remaining ? color.bg.brandSolid : color.bg.neutralWeak }]}
            />
          ))}
        </View>
      ) : (
        <ProgressBar value={limit > 0 ? remaining / limit : 0} style={{ marginTop: space.x4 }} />
      )}
      <Text variant="t3-regular" color="neutralSubtle" tabular style={{ marginTop: space.x2_5 }}>
        하루 {limit}회까지 신청할 수 있어요 · 오늘 {todayCount}회 신청
      </Text>

      {remaining === 0 && (
        <Notice tone="gray" title="오늘은 모두 신청했어요" style={{ marginTop: space.x4 }}>
          쪽잠은 하루 {limit}회까지 신청할 수 있어요. 내일 다시 신청해 주세요.
        </Notice>
      )}
    </Section>
  );
}

/** 신청 폼 — 시작 시간 + 쪽잠 시간(20·30분) */
export function NapForm({
  startTime,
  onStartTime,
  durationMin,
  onDuration,
  durations,
  disabled,
  initialDraft,
}: {
  startTime: string;
  onStartTime: (v: string) => void;
  durationMin: number;
  onDuration: (v: number) => void;
  durations: number[];
  disabled?: boolean;
  initialDraft: () => string;
}) {
  return (
    <Section>
      <View style={{ gap: space.x6 }}>
        <Field label="시작 시간">
          <TimeField
            label="시작 시간"
            value={startTime}
            onChange={onStartTime}
            disabled={disabled}
            initialDraft={initialDraft}
          />
        </Field>
        <Field label="쪽잠 시간">
          <Segmented<string>
            options={durations.map((d) => ({ value: String(d), label: `${d}분` }))}
            value={String(durationMin)}
            onChange={(v) => onDuration(Number(v))}
            disabled={disabled}
          />
        </Field>
      </View>
    </Section>
  );
}

/** 신청 내역 (오늘 + 최근 7일) */
export function NapHistory({ naps, today }: { naps: NapRequest[]; today: string }) {
  if (naps.length === 0) {
    return (
      <Section>
        <EmptyState
          icon={Moon}
          title="아직 신청 내역이 없어요"
          description="피곤할 땐 무리하지 말고 쪽잠을 신청해 보세요."
          style={{ paddingVertical: space.x8 }}
        />
      </Section>
    );
  }
  return (
    <Section title="최근 신청" flush>
      {naps.map((n) => {
        const status = REQUEST_STATUS[n.status];
        return (
          <ListRow
            key={n.id}
            title={
              <Text variant="t5-medium" tabular>
                {n.startTime} · {n.durationMin}분
              </Text>
            }
            description={
              <View>
                <Text variant="t4-regular" color="neutralSubtle" tabular>
                  {n.date === today ? '오늘' : fmtDateDow(n.date)}
                </Text>
                {!!n.note && (
                  <Text variant="t4-regular" color="neutralMuted" style={{ marginTop: space.x1 }}>
                    {n.note}
                    {n.decidedByName ? ` — ${n.decidedByName}` : ''}
                  </Text>
                )}
              </View>
            }
            trailing={<Badge tone={status.tone}>{status.label}</Badge>}
          />
        );
      })}
    </Section>
  );
}

export function NapSkeleton({ tablet }: { tablet: boolean }) {
  const left = (
    <>
      <SkeletonCard gap={space.x2}>
        <Skeleton style={{ width: 96, height: 16 }} />
        <Skeleton style={{ width: 120, height: 34 }} />
        <View style={s.segments}>
          <Skeleton style={[s.segment, { borderRadius: radius.full }]} />
          <Skeleton style={[s.segment, { borderRadius: radius.full }]} />
        </View>
        <Skeleton style={{ width: '65%', height: 14, marginTop: space.x1 }} />
      </SkeletonCard>
      <SkeletonCard gap={space.x2}>
        <Skeleton style={{ width: 72, height: 18 }} />
        <Skeleton style={{ height: 52, borderRadius: radius.r3 }} />
        <Skeleton style={{ width: 72, height: 18, marginTop: space.x4 }} />
        <Skeleton style={{ height: 42, borderRadius: radius.full }} />
      </SkeletonCard>
    </>
  );
  const right = (
    <SkeletonCard gap={space.x5}>
      <Skeleton style={{ width: 80, height: 22 }} />
      {[0, 1].map((i) => (
        <SkeletonRow key={i} icon={false} />
      ))}
    </SkeletonCard>
  );
  return tablet ? (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.x3 }}>
      <View style={{ flex: 1.25, gap: space.x3 }}>{left}</View>
      <View style={{ flex: 1, gap: space.x3 }}>{right}</View>
    </View>
  ) : (
    <View style={{ gap: space.x3 }}>
      {left}
      {right}
    </View>
  );
}

const s = StyleSheet.create({
  quotaHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.x4 },
  segments: { flexDirection: 'row', gap: space.x1_5, marginTop: space.x4 },
  segment: { flex: 1, height: space.x2, borderRadius: radius.full },
});
