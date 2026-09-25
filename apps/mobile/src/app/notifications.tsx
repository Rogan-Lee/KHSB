import { Redirect, useFocusEffect } from 'expo-router';
import {
  BellOff,
  BellRing,
  CalendarCheck,
  ClipboardCheck,
  DoorOpen,
  FileText,
  Inbox,
  Megaphone,
  MessageCircle,
  MessageCircleQuestion,
  Send,
  Settings,
  Sunrise,
  Sunset,
  type LucideIcon,
} from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Linking, Platform, StyleSheet, Switch, View } from 'react-native';

import {
  IconTile,
  ListRow,
  Notice,
  Press,
  Screen,
  Section,
  Skeleton,
  Stack,
  Text,
  color,
  radius,
  space,
  toast,
  useResponsive,
  type Tone,
} from '@/design';
import type { StudentTasksResponse } from '@/lib/mobile-api';
import { requestMobileApi } from '@/lib/mobile-api';
import {
  ALWAYS_ON_CATEGORY,
  NOTIFICATION_CATEGORIES,
  getNotificationPermissionState,
  getNotificationPreferences,
  getScheduledTaskReminderCount,
  requestNotificationPermission,
  saveNotificationPreferences,
  scheduleNotificationPreview,
  syncTaskDeadlineNotifications,
  type NotificationChannel,
  type NotificationPermissionState,
  type NotificationPreferences,
  type NotificationRole,
} from '@/lib/notifications';
import {
  REMINDER_DAY_BEFORE_HOUR,
  REMINDER_SAME_DAY_HOUR,
} from '@/lib/notification-reminders';
import {
  getRemotePushRegistrationState,
  syncRemotePushRegistration,
  type RemotePushRegistrationState,
} from '@/lib/push-registration';
import { useSession } from '@/lib/session';

const IS_WEB = Platform.OS === 'web';

const CATEGORY_ICON: Record<NotificationRole, Partial<Record<NotificationChannel, { icon: LucideIcon; tone: Tone }>>> = {
  student: {
    tasks: { icon: ClipboardCheck, tone: 'brand' },
    answers: { icon: MessageCircleQuestion, tone: 'info' },
    mentoring: { icon: MessageCircle, tone: 'ok' },
  },
  staff: {
    answers: { icon: MessageCircleQuestion, tone: 'info' },
    mentoring: { icon: CalendarCheck, tone: 'violet' },
    tasks: { icon: Inbox, tone: 'brand' },
  },
  parent: {
    tasks: { icon: DoorOpen, tone: 'ok' },
    mentoring: { icon: FileText, tone: 'brand' },
  },
};

/** 태블릿에서 설정 목록 폭 — 스위치가 설명에서 멀어지지 않게 기본(720)보다 좁게 가운데 */
const SETTINGS_TABLET_WIDTH = 600;

/** 알림 설정 — 학생·직원·학부모 공통 (역할별 알림 종류). */
export default function NotificationSettingsScreen() {
  const { session, status } = useSession();
  const { isTablet } = useResponsive();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [permission, setPermission] = useState<NotificationPermissionState>('undetermined');
  const [remoteStatus, setRemoteStatus] = useState<RemotePushRegistrationState>('disabled');
  const [scheduledCount, setScheduledCount] = useState(0);
  const [asking, setAsking] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const prefsRef = useRef<NotificationPreferences | null>(null);
  const saveChain = useRef<Promise<void>>(Promise.resolve());

  const role: NotificationRole = session?.role ?? 'student';
  const isStudent = session?.role === 'student';

  const load = useCallback(async () => {
    try {
      const [nextPrefs, nextPermission, nextCount, nextRemote] = await Promise.all([
        getNotificationPreferences(),
        getNotificationPermissionState(),
        getScheduledTaskReminderCount(),
        getRemotePushRegistrationState(),
      ]);
      prefsRef.current = nextPrefs;
      setPrefs(nextPrefs);
      setPermission(nextPermission);
      setScheduledCount(nextCount);
      setRemoteStatus(nextRemote);
    } catch {
      toast('알림 설정을 불러오지 못했어요', 'error');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // 기기 설정에서 권한을 바꾸고 돌아오면 다시 읽는다
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void load();
    });
    return () => sub.remove();
  }, [load]);

  if (status !== 'loading' && !session) {
    return <Redirect href="/(auth)" />;
  }

  async function resyncReminders(next: NotificationPreferences) {
    if (!isStudent) return;
    try {
      if (next.enabled && (next.reminderDayBefore || next.reminderSameDay)) {
        const tasks = await requestMobileApi<StudentTasksResponse>('/api/mobile/v1/student/tasks');
        setScheduledCount(await syncTaskDeadlineNotifications(tasks.items));
      } else {
        setScheduledCount(await getScheduledTaskReminderCount());
      }
    } catch {
      toast('설정은 저장했지만 마감 알림 예약을 갱신하지 못했어요', 'error');
    }
  }

  async function persist(next: NotificationPreferences) {
    await saveNotificationPreferences(next);
    try {
      setRemoteStatus(await syncRemotePushRegistration(next));
    } catch {
      setRemoteStatus('error');
      toast('설정은 저장했지만 서버에 기기를 연결하지 못했어요', 'error');
    }
    await resyncReminders(next);
  }

  /** 화면은 바로 바꾸고 저장은 순서대로 (빠르게 여러 번 눌러도 마지막 상태가 남는다) */
  function update(patch: Partial<NotificationPreferences>) {
    const base = prefsRef.current;
    if (!base) return;
    const next = { ...base, ...patch };
    prefsRef.current = next;
    setPrefs(next);
    saveChain.current = saveChain.current
      .then(() => persist(next))
      .catch(() => toast('알림 설정을 저장하지 못했어요', 'error'));
  }

  async function toggleMaster(on: boolean) {
    if (on) {
      if (asking) return;
      setAsking(true);
      try {
        const next = await requestNotificationPermission();
        setPermission(next);
        if (next !== 'granted') {
          toast(
            next === 'denied' ? '기기 설정에서 강한선배 알림을 허용해 주세요' : '알림 권한을 허용해야 받을 수 있어요',
            'error',
          );
          return;
        }
      } catch {
        toast('알림 권한을 확인하지 못했어요', 'error');
        return;
      } finally {
        setAsking(false);
      }
    }
    update({ enabled: on });
  }

  async function preview() {
    if (previewing) return;
    setPreviewing(true);
    try {
      await scheduleNotificationPreview();
      setPermission('granted');
      toast('2초 뒤에 미리보기 알림이 와요', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '알림을 보내지 못했어요', 'error');
    } finally {
      setPreviewing(false);
    }
  }

  const openDeviceSettings = () => {
    void Linking.openSettings().catch(() => toast('기기 설정을 열지 못했어요', 'error'));
  };

  const granted = permission === 'granted';
  const masterOn = !!prefs?.enabled && granted;
  const masterDescription = IS_WEB
    ? '알림은 iOS·Android 앱에서 받을 수 있어요'
    : permission === 'denied'
      ? '기기 설정에서 알림이 꺼져 있어요'
      : !masterOn
        ? '켜면 새 소식을 바로 알려 드려요'
        : remoteStatus === 'error'
          ? '켜져 있지만 서버 연결에 실패했어요'
          : remoteStatus === 'unsupported'
            ? '켜져 있어요 · 이 기기에서는 마감 알림만 받아요'
            : remoteStatus === 'unconfigured'
              ? '켜져 있어요 · 푸시 서버 설정이 필요해요'
              : '켜져 있어요';

  return (
    <Screen
      kind="push"
      title="알림 설정"
      backFallback="/"
      maxWidth={isTablet ? SETTINGS_TABLET_WIDTH : undefined}>
      {!prefs || !session ? (
        <SettingsSkeleton />
      ) : (
        <Stack>
          <Section flush>
            <SwitchRow
              icon={masterOn ? BellRing : BellOff}
              tone={masterOn ? 'brand' : 'gray'}
              title="알림 받기"
              description={masterDescription}
              value={masterOn}
              disabled={IS_WEB || asking}
              onValueChange={(v) => void toggleMaster(v)}
            />
          </Section>

          {!IS_WEB && permission === 'denied' && (
            <Notice tone="warn" icon={BellOff} title="알림이 꺼져 있어요" onPress={openDeviceSettings}>
              기기 설정 → 알림에서 강한선배를 허용해 주세요.
            </Notice>
          )}
          {masterOn && remoteStatus === 'error' && (
            <Notice tone="bad" onPress={() => update({})}>
              서버에 이 기기를 연결하지 못했어요. 눌러서 다시 시도해 주세요.
            </Notice>
          )}

          <Section
            title="받을 알림"
            description={masterOn ? undefined : '알림 받기를 켜면 고를 수 있어요'}
            flush>
            {NOTIFICATION_CATEGORIES[role].map((category) => {
              const look = CATEGORY_ICON[role][category.channel] ?? { icon: BellRing, tone: 'gray' as const };
              return (
                <SwitchRow
                  key={category.channel}
                  icon={look.icon}
                  tone={look.tone}
                  title={category.title}
                  description={category.description}
                  value={masterOn && prefs[category.channel]}
                  disabled={!masterOn}
                  onValueChange={(v) => update({ [category.channel]: v })}
                />
              );
            })}
            <ListRow
              leading={<IconTile icon={Megaphone} size={40} />}
              title={ALWAYS_ON_CATEGORY[role].title}
              description={ALWAYS_ON_CATEGORY[role].description}
              trailing={
                <Text variant="t4-medium" color={masterOn ? 'neutralMuted' : 'neutralSubtle'}>
                  {masterOn ? '항상' : '꺼짐'}
                </Text>
              }
              muted={!masterOn}
            />
          </Section>

          {isStudent && (
            <Section
              title="수행평가 마감 알림"
              description={
                masterOn
                  ? `이 기기에 미리 예약해 두는 알림이에요 · 지금 ${scheduledCount}건 예약됨`
                  : '이 기기에 미리 예약해 두는 알림이에요'
              }
              flush>
              <SwitchRow
                icon={Sunset}
                tone="warn"
                title={`마감 전날 저녁 ${REMINDER_DAY_BEFORE_HOUR - 12}시`}
                description="'내일 마감이에요' 하고 알려 드려요"
                value={masterOn && prefs.reminderDayBefore}
                disabled={!masterOn}
                onValueChange={(v) => update({ reminderDayBefore: v })}
              />
              <SwitchRow
                icon={Sunrise}
                tone="info"
                title={`마감 당일 아침 ${REMINDER_SAME_DAY_HOUR}시`}
                description="'오늘 마감이에요' 하고 알려 드려요"
                value={masterOn && prefs.reminderSameDay}
                disabled={!masterOn}
                onValueChange={(v) => update({ reminderSameDay: v })}
              />
            </Section>
          )}

          {!IS_WEB && (
            <Section flush>
              <ListRow
                leading={<IconTile icon={Send} size={40} />}
                title="알림 미리보기"
                description={previewing ? '보내는 중…' : '2초 뒤에 테스트 알림을 보내요'}
                onPress={() => void preview()}
              />
              <ListRow
                leading={<IconTile icon={Settings} size={40} />}
                title="기기 알림 설정 열기"
                description="소리·배너 방식은 기기 설정에서 바꿀 수 있어요"
                onPress={openDeviceSettings}
              />
            </Section>
          )}
        </Stack>
      )}
    </Screen>
  );
}

// ─── 스위치 행 (ListRow 규격 + SEED Switch 색) ───────────────────────

function SwitchRow({
  icon,
  tone,
  title,
  description,
  value,
  disabled = false,
  onValueChange,
}: {
  icon: LucideIcon;
  tone: Tone;
  title: string;
  description?: ReactNode;
  value: boolean;
  disabled?: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <Press
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      scale={0}
      pressedBg
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityState={{ checked: value, disabled }}
      style={s.row}>
      <IconTile icon={icon} tone={disabled ? 'gray' : tone} size={40} />
      <View style={s.body}>
        <Text variant="t5-medium" color={disabled ? 'neutralSubtle' : 'neutral'}>
          {title}
        </Text>
        {description != null &&
          (typeof description === 'string' ? (
            <Text variant="t4-regular" color="neutralSubtle">
              {description}
            </Text>
          ) : (
            description
          ))}
      </View>
      <SeedSwitch value={value} disabled={disabled} onValueChange={onValueChange} />
    </Press>
  );
}

/** RN Switch 에 SEED switchmark 색 — 켬 bg.brandSolid · 끔 palette.gray600 · 비활성 투명도 0.38 */
function SeedSwitch({
  value,
  disabled,
  onValueChange,
}: {
  value: boolean;
  disabled: boolean;
  onValueChange: (value: boolean) => void;
}) {
  // 행 전체가 눌림 영역 — 스위치는 터치를 받지 않게 해서 두 번 토글되지 않도록 한다
  return (
    <View
      style={{ pointerEvents: 'none', opacity: disabled ? 0.38 : 1 }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ false: color.palette.gray600, true: color.bg.brandSolid }}
        thumbColor={color.palette.staticWhite}
        ios_backgroundColor={color.palette.gray600}
      />
    </View>
  );
}

function SettingsSkeleton() {
  return (
    <Stack>
      <Skeleton style={{ height: 76, borderRadius: radius.r5 }} />
      <Section>
        <View style={{ gap: space.x5 }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: space.x3 }}>
              <Skeleton style={{ width: 40, height: 40, borderRadius: radius.r3 }} />
              <View style={{ flex: 1, gap: space.x1_5 }}>
                <Skeleton style={{ width: '40%', height: 16 }} />
                <Skeleton style={{ width: '70%', height: 14 }} />
              </View>
              <Skeleton style={{ width: 51, height: 31, borderRadius: radius.full }} />
            </View>
          ))}
        </View>
      </Section>
    </Stack>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    marginHorizontal: space.x2,
    paddingHorizontal: space.x3,
    paddingVertical: space.x3,
    minHeight: 64,
    borderRadius: radius.r4,
  },
  body: { flex: 1, minWidth: 0, gap: space.x0_5 },
});
