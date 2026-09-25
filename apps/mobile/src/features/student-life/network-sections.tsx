import { Globe, Smartphone, Wifi, type LucideIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Badge,
  Chip,
  ChipGroup,
  EmptyState,
  IconTile,
  ListRow,
  radius,
  Section,
  Skeleton,
  space,
  Text,
  TextField,
} from '@/design';
import {
  NETWORK_KIND_LABELS,
  NETWORK_KIND_ORDER,
  NETWORK_TARGET_META,
  REQUEST_STATUS,
  type NetworkRequest,
  type NetworkRequestKind,
} from '@/lib/api/student-life';

import { DateField } from './date-field';
import { addDays, fmtRange, todayKSTStr } from './format';
import { TimeField } from './time-field';
import { Field, SkeletonCard, SkeletonRow } from './ui';

// 웹 학생 포털 /s/[token]/network (network-panel.tsx) 와 같은 폼·목록·배지 규칙.

export const MAX_TARGET = 200;
export const MAX_REASON = 500;
/** 날짜는 오늘부터 이 기간 안에서 고른다 */
const DATE_RANGE_DAYS = 60;

const KIND_ICON: Record<NetworkRequestKind, LucideIcon> = {
  WIFI_UNBLOCK: Wifi,
  DOMAIN_ALLOW: Globe,
  APP_UNBLOCK: Smartphone,
};

export type NetworkFormState = {
  kind: NetworkRequestKind;
  target: string;
  date: string;
  startTime: string;
  endTime: string;
  reason: string;
};

const pad = (n: number) => String(n).padStart(2, '0');

/** 다음 정각 "HH:00" (KST) — 시간 시트가 처음 가리킬 값 */
function nextHourKST(offsetHours = 0): string {
  const h = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCHours();
  return `${pad((h + 1 + offsetHours) % 24)}:00`;
}

export function NetworkForm({
  value,
  onChange,
  disabled,
}: {
  value: NetworkFormState;
  onChange: (patch: Partial<NetworkFormState>) => void;
  disabled?: boolean;
}) {
  const targetMeta = NETWORK_TARGET_META[value.kind];
  const today = todayKSTStr();

  return (
    <Section>
      <View style={{ gap: space.x6 }}>
        <Field label="신청 유형">
          <ChipGroup>
            {NETWORK_KIND_ORDER.map((k) => (
              <Chip key={k} selected={value.kind === k} onPress={() => onChange({ kind: k })} disabled={disabled}>
                {NETWORK_KIND_LABELS[k]}
              </Chip>
            ))}
          </ChipGroup>
        </Field>

        {targetMeta && (
          <TextField
            label={targetMeta.label}
            value={value.target}
            onChangeText={(target) => onChange({ target })}
            placeholder={targetMeta.placeholder}
            maxLength={MAX_TARGET}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType={value.kind === 'DOMAIN_ALLOW' ? 'url' : 'default'}
            editable={!disabled}
            returnKeyType="next"
          />
        )}

        <Field label="날짜">
          <DateField
            label="날짜"
            value={value.date}
            onChange={(date) => onChange({ date })}
            min={today}
            max={addDays(today, DATE_RANGE_DAYS)}
            disabled={disabled}
          />
        </Field>

        <Field label="사용 시간">
          <View style={s.range}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <TimeField
                label="시작 시간"
                value={value.startTime}
                onChange={(startTime) => onChange({ startTime })}
                placeholder="시작"
                align="center"
                minuteStep={5}
                initialDraft={() => nextHourKST()}
                disabled={disabled}
              />
            </View>
            <Text variant="t5-regular" color="neutralSubtle">
              ~
            </Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <TimeField
                label="종료 시간"
                value={value.endTime}
                onChange={(endTime) => onChange({ endTime })}
                placeholder="종료"
                align="center"
                minuteStep={5}
                initialDraft={() => {
                  // 시작을 골랐으면 1시간 뒤부터
                  const hit = /^(\d{2}):(\d{2})$/.exec(value.startTime);
                  if (!hit) return nextHourKST(1);
                  return `${pad((Number(hit[1]) + 1) % 24)}:${hit[2]}`;
                }}
                disabled={disabled}
              />
            </View>
          </View>
        </Field>

        <TextField
          label="사유"
          value={value.reason}
          onChangeText={(reason) => onChange({ reason })}
          placeholder="예: 인강 수강을 위해 필요해요"
          maxLength={MAX_REASON}
          showCount
          multiline
          minHeight={120}
          editable={!disabled}
        />
      </View>
    </Section>
  );
}

/** 승인된 신청이 지금 사용 중인지·끝났는지 (목록 보조 표시) */
function usageHint(r: NetworkRequest, now: number): string | null {
  if (r.status !== 'APPROVED') return null;
  const start = new Date(r.startAt).getTime();
  const end = new Date(r.endAt).getTime();
  if (now >= end) return '사용 종료';
  if (now >= start) return '사용 중';
  return null;
}

/** 지금 시각 — 1분마다 갱신 ('사용 중' → '사용 종료' 전환) */
function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function NetworkHistory({ requests }: { requests: NetworkRequest[] }) {
  const now = useNow();
  if (requests.length === 0) {
    return (
      <Section>
        <EmptyState
          icon={Wifi}
          title="아직 신청 내역이 없어요"
          description="공부에 필요한 사이트·앱 사용을 신청해 보세요."
          style={{ paddingVertical: space.x8 }}
        />
      </Section>
    );
  }
  return (
    <Section title="신청 내역" flush>
      {requests.map((r) => {
        const status = REQUEST_STATUS[r.status];
        const hint = usageHint(r, now);
        return (
          <ListRow
            key={r.id}
            leading={<IconTile icon={KIND_ICON[r.kind]} tone="gray" />}
            meta={r.target ? <Badge>{NETWORK_KIND_LABELS[r.kind]}</Badge> : undefined}
            title={
              <Text variant="t5-medium" numberOfLines={1}>
                {r.target ?? NETWORK_KIND_LABELS[r.kind]}
              </Text>
            }
            description={
              <View>
                <Text variant="t4-regular" color="neutralMuted" tabular>
                  {fmtRange(r.startAt, r.endAt)}
                  {hint ? ` · ${hint}` : ''}
                </Text>
                <Text variant="t4-regular" color="neutralSubtle" numberOfLines={2} style={{ marginTop: space.x0_5 }}>
                  {r.reason}
                </Text>
              </View>
            }
            trailing={<Badge tone={status.tone}>{status.label}</Badge>}
          />
        );
      })}
    </Section>
  );
}

export function NetworkSkeleton({ tablet }: { tablet: boolean }) {
  const left = (
    <SkeletonCard gap={space.x2}>
      <Skeleton style={{ width: 72, height: 18 }} />
      <View style={{ flexDirection: 'row', gap: space.x2 }}>
        {[96, 84, 72].map((w) => (
          <Skeleton key={w} style={{ width: w, height: 36, borderRadius: radius.full }} />
        ))}
      </View>
      <Skeleton style={{ width: 40, height: 18, marginTop: space.x4 }} />
      <Skeleton style={{ height: 52, borderRadius: radius.r3 }} />
      <Skeleton style={{ width: 72, height: 18, marginTop: space.x4 }} />
      <Skeleton style={{ height: 52, borderRadius: radius.r3 }} />
      <Skeleton style={{ width: 40, height: 18, marginTop: space.x4 }} />
      <Skeleton style={{ height: 120, borderRadius: radius.r3 }} />
    </SkeletonCard>
  );
  const right = (
    <SkeletonCard gap={space.x5}>
      <Skeleton style={{ width: 80, height: 22 }} />
      {[0, 1].map((i) => (
        <SkeletonRow key={i} />
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
  range: { flexDirection: 'row', alignItems: 'center', gap: space.x2 },
});
