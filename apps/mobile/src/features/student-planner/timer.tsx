import { router } from 'expo-router';
import { Check, Play, Square, Timer } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  Button,
  Chip,
  color,
  IconTile,
  ListRow,
  Notice,
  Press,
  radius,
  Section,
  space,
  Text,
  toast,
} from '@/design';
import { FOCUS_ROUTE, FOCUS_SUPPORTED, keepFocusIfActive, startFocus, useFocusMode } from '@/features/student-focus/focus';
import { dotColor } from '@/features/student-plan/format';
import { sendTimer, STUDENT_TIMER_PATH, type TimerState } from '@/lib/api/student-plan';
import { useMobileQuery } from '@/lib/mobile-api';

import { fmtMinutes, SUBJECTS } from './planner';
import { PLANNER_ROUTE } from './today-card';

// 공부 타이머 — 서버(StudySession)에 시작·정지만 남긴다. 앱이 꺼져 있어도 계속 재고, 3시간이 되면 서버가 끊는다.
// iOS 는 시작할 때 집중 모드(스크린 타임 잠금)를 같이 켤 수 있다 — 잠금 정보는 기기 밖으로 나가지 않고
// 타이머 기록(언제 시작·정지했는지)만 서버로 간다. 정지해도 집중 모드는 그대로(끄려면 잠금 비밀번호).

const MAX_MS = 3 * 60 * 60_000;
const ASK_MS = 2 * 60 * 60_000;

const pad = (n: number) => String(n).padStart(2, '0');
export const hms = (ms: number) => {
  const sec = Math.floor(ms / 1000);
  return `${pad(Math.floor(sec / 3600))}:${pad(Math.floor((sec % 3600) / 60))}:${pad(sec % 60)}`;
};
const subjectColor = (name: string | null) => {
  const sub = SUBJECTS.find((s) => s.name === name);
  return sub ? dotColor(sub.color) : color.fg.placeholder;
};

/** 지금 시각 — 켜져 있는 동안 1초마다 */
function useNow(on: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [on]);
  return now;
}

/**
 * 타이머 상태 + 1초마다 다시 그리기.
 * ponytail: 경과 시간은 기기 시계로 센다(폰 시계는 네트워크로 맞춰져 있음) — 어긋나는 기기가 나오면 응답의 now 로 보정.
 */
export function useStudyTimer() {
  const query = useMobileQuery<TimerState>(STUDENT_TIMER_PATH);
  const [acted, setActed] = useState<TimerState | null>(null);
  const [pending, setPending] = useState(false);

  // 방금 누른 동작의 응답이 우선, 화면에 돌아와 새로 읽으면 그 값으로
  const [seen, setSeen] = useState<TimerState | null>(null);
  if (query.data !== seen) {
    setSeen(query.data);
    setActed(null);
  }
  const state = acted ?? query.data;
  const active = state?.active ?? null;
  const now = useNow(!!active);
  const elapsed = active ? Math.max(0, Math.min(now - Date.parse(active.startedAt), MAX_MS)) : 0;
  const running = !!active && elapsed < MAX_MS;

  // 오늘 합계(초) — 서버 합계(응답 시각까지)에 그 뒤 흐른 시간을 더한다
  const sinceFetch = running && state ? Math.max(0, now - Date.parse(state.now)) : 0;
  const todaySeconds = (state?.totalMinutes ?? 0) * 60 + sinceFetch / 1000;

  const act = async (action: 'start' | 'stop' | 'keep', subject?: string | null) => {
    setPending(true);
    try {
      setActed(await sendTimer(action, subject));
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : '타이머를 바꾸지 못했어요', 'error');
      return false;
    } finally {
      setPending(false);
    }
  };

  return {
    loaded: !!state,
    error: state ? null : query.error,
    active: running ? active : null,
    elapsed,
    asking: running && elapsed >= ASK_MS,
    todaySeconds,
    bySubject: state?.bySubject ?? [],
    pending,
    act,
  };
}

// ── 플래너 하루 탭 맨 위 ───────────────────────────────────────────────────

export function TimerCard() {
  const t = useStudyTimer();
  const [subject, setSubject] = useState<string | null>(null);

  if (!t.loaded) return null;

  return (
    <Section
      title="공부 타이머"
      action={
        t.active ? undefined : (
          <Text variant="t4-medium" color="neutralSubtle" tabular>
            오늘 {fmtMinutes(Math.floor(t.todaySeconds / 60))}
          </Text>
        )
      }>
      {t.active ? (
        <View style={{ gap: space.x4 }}>
          {/* 큰 숫자 = 오늘 합계 ("계속"으로 기록이 나뉘어도 줄지 않게), 작은 줄 = 이번에 시작한 뒤 */}
          <View style={s.clockBox}>
            <Text variant="t4-medium" color="neutralSubtle">
              오늘 공부
            </Text>
            <Text variant="t12-bold" tabular accessibilityRole="timer">
              {hms(t.todaySeconds * 1000)}
            </Text>
            <View style={s.subjectLine}>
              <View style={[s.dot, { backgroundColor: subjectColor(t.active.subject) }]} />
              <Text variant="t4-medium" color="neutralSubtle" tabular>
                {t.active.subject ?? '과목 없음'} 공부 중 · 이번 {hms(t.elapsed)}
              </Text>
            </View>
          </View>
          {t.asking && <KeepNotice pending={t.pending} onKeep={() => void keepBoth(t)} />}
          <Button variant="dark" size="xl" block icon={Square} loading={t.pending} onPress={() => void t.act('stop')}>
            정지
          </Button>
        </View>
      ) : (
        <View style={{ gap: space.x3 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
            {SUBJECTS.map((sub) => (
              <Chip
                key={sub.name}
                size="sm"
                selected={subject === sub.name}
                onPress={() => setSubject(subject === sub.name ? null : sub.name)}>
                <View style={s.subjectLine}>
                  <View style={[s.dot, { backgroundColor: dotColor(sub.color) }]} />
                  <Text variant="t3-medium" color={subject === sub.name ? 'neutralInverted' : 'neutral'}>
                    {sub.name}
                  </Text>
                </View>
              </Chip>
            ))}
          </ScrollView>
          <StartButton subject={subject} t={t} />
        </View>
      )}
      <Breakdown items={t.bySubject} />
    </Section>
  );
}

function KeepNotice({ pending, onKeep }: { pending: boolean; onKeep: () => void }) {
  return (
    <Notice tone="warn" title="아직 공부 중인가요?">
      <View style={{ gap: space.x2, alignItems: 'flex-start' }}>
        <Text variant="t4-regular">3시간이 되면 타이머가 멈춰요.</Text>
        <Button size="sm" loading={pending} onPress={onKeep}>
          계속 공부하기
        </Button>
      </View>
    </Notice>
  );
}

/** 타이머 "계속" = 집중 모드도 같이 다시 3시간 (켜져 있을 때만) */
async function keepBoth(t: ReturnType<typeof useStudyTimer>) {
  const ok = await t.act('keep');
  if (ok) await keepFocusIfActive().catch(() => undefined);
}

/** iOS 는 "집중 모드도 같이 켜기" — 앱·비밀번호를 정해 두지 않았으면 설정으로 안내 */
function StartButton({ subject, t }: { subject: string | null; t: ReturnType<typeof useStudyTimer> }) {
  const start = (withFocus: boolean) => async () => {
    const ok = await t.act('start', subject);
    if (!ok || !withFocus) return;
    try {
      await startFocus();
      toast('집중 모드도 켰어요', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : '집중 모드를 켜지 못했어요', 'error');
    }
  };
  if (!FOCUS_SUPPORTED) {
    return (
      <Button size="xl" block icon={Play} loading={t.pending} onPress={() => void start(false)()}>
        {subject ? `${subject} 시작` : '시작'}
      </Button>
    );
  }
  return <FocusStart subject={subject} pending={t.pending} onStart={(withFocus) => void start(withFocus)()} />;
}

function FocusStart({
  subject,
  pending,
  onStart,
}: {
  subject: string | null;
  pending: boolean;
  onStart: (withFocus: boolean) => void;
}) {
  const f = useFocusMode();
  const [together, setTogether] = useState(true);
  const can = f.ready && !f.active;
  return (
    <View style={{ gap: space.x3 }}>
      <Button size="xl" block icon={Play} loading={pending} onPress={() => onStart(can && together)}>
        {subject ? `${subject} 시작` : '시작'}
      </Button>
      {f.active ? (
        <Text variant="t3-regular" color="neutralSubtle">
          집중 모드가 켜져 있어요.
        </Text>
      ) : can ? (
        <Press
          onPress={() => setTogether(!together)}
          scale={0}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: together }}
          style={s.togetherRow}>
          <View style={[s.box, together && s.boxOn]}>
            {together && <Check color={color.palette.staticWhite} size={14} strokeWidth={3} />}
          </View>
          <Text variant="t4-regular">집중 모드도 같이 켜기 (앱 {f.picked}개 잠금)</Text>
        </Press>
      ) : (
        <Press onPress={() => router.push(FOCUS_ROUTE)} scale={0} accessibilityRole="link">
          <Text variant="t3-regular" color="neutralSubtle">
            집중 모드를 정해 두면 타이머와 같이 켤 수 있어요 ›
          </Text>
        </Press>
      )}
    </View>
  );
}

function Breakdown({ items }: { items: TimerState['bySubject'] }) {
  if (items.length === 0) return null;
  return (
    <View style={s.breakdown}>
      {items.map((it) => (
        <View key={it.subject ?? '-'} style={s.subjectLine}>
          <View style={[s.dot, { backgroundColor: subjectColor(it.subject) }]} />
          <Text variant="t3-medium" color="neutralSubtle">
            {it.subject ?? '과목 없음'} {fmtMinutes(it.minutes)}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ── 학생 홈 ──────────────────────────────────────────────────────────────

/** 홈 — 재고 있으면 경과 시간 + 정지, 아니면 오늘 합계 + 시작(플래너로) */
export function TimerHomeCard() {
  const t = useStudyTimer();
  if (!t.loaded) return null;
  if (t.active) {
    return (
      <Section flush>
        <ListRow
          href={PLANNER_ROUTE}
          leading={<IconTile icon={Timer} tone="brand" solid />}
          title={`${t.active.subject ?? '과목 없음'} 공부 중`}
          description={
            <Text variant="t4-medium" color="neutralSubtle" tabular>
              오늘 {hms(t.todaySeconds * 1000)}
            </Text>
          }
          trailing={
            t.asking ? (
              <Button size="sm" loading={t.pending} onPress={() => void keepBoth(t)}>
                계속
              </Button>
            ) : (
              <Button size="sm" variant="gray" loading={t.pending} onPress={() => void t.act('stop')}>
                정지
              </Button>
            )
          }
          chevron={false}
        />
      </Section>
    );
  }
  const today = Math.floor(t.todaySeconds / 60);
  return (
    <Section flush>
      <ListRow
        href={PLANNER_ROUTE}
        leading={<IconTile icon={Timer} tone="brand" />}
        title="공부 타이머"
        description={today > 0 ? `오늘 ${fmtMinutes(today)}` : '과목을 골라 시작해요'}
        trailing={
          <Button size="sm" onPress={() => router.push(PLANNER_ROUTE)}>
            시작
          </Button>
        }
        chevron={false}
      />
    </Section>
  );
}

const s = StyleSheet.create({
  clockBox: { alignItems: 'center', gap: space.x1, paddingVertical: space.x2 },
  subjectLine: { flexDirection: 'row', alignItems: 'center', gap: space.x1_5 },
  dot: { width: 8, height: 8, borderRadius: radius.full },
  chips: { gap: space.x1_5, paddingRight: space.x2 },
  breakdown: { flexDirection: 'row', flexWrap: 'wrap', gap: space.x3, marginTop: space.x4 },
  togetherRow: { flexDirection: 'row', alignItems: 'center', gap: space.x2, alignSelf: 'flex-start' },
  box: {
    width: 20,
    height: 20,
    borderRadius: radius.r1,
    borderWidth: 1.5,
    borderColor: color.stroke.neutralMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: color.bg.brandSolid, borderColor: color.bg.brandSolid },
});
