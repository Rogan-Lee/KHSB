import { Redirect, router, useFocusEffect } from 'expo-router';
import { BellRing, ChevronLeft, Clock3, Settings2 } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { Card, PrimaryButton, SectionTitle } from '@/components/mobile-ui';
import { colors, spacing } from '@/constants/theme';
import type { StudentTasksResponse } from '@/lib/mobile-api';
import { requestMobileApi } from '@/lib/mobile-api';
import {
  getNotificationPermissionState,
  getNotificationPreferences,
  getScheduledTaskReminderCount,
  requestNotificationPermission,
  saveNotificationPreferences,
  scheduleNotificationPreview,
  syncTaskDeadlineNotifications,
} from '@/lib/notifications';
import type {
  NotificationPermissionState,
  NotificationPreferences,
} from '@/lib/notifications';
import { useSession } from '@/lib/session';

const DEFAULT_PREFERENCES: NotificationPreferences = {
  answers: true,
  enabled: false,
  mentoring: true,
  tasks: true,
};

export default function NotificationSettingsScreen() {
  const { session, status } = useSession();
  const [preferences, setPreferences] =
    useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [permission, setPermission] =
    useState<NotificationPermissionState>('undetermined');
  const [scheduledCount, setScheduledCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const [nextPreferences, nextPermission, nextCount] = await Promise.all([
      getNotificationPreferences(),
      getNotificationPermissionState(),
      getScheduledTaskReminderCount(),
    ]);
    setPreferences(nextPreferences);
    setPermission(nextPermission);
    setScheduledCount(nextCount);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load().catch(() => {
        setMessage('알림 설정을 불러오지 못했습니다.');
      });
    }, [load]),
  );

  if (status !== 'loading' && !session) {
    return <Redirect href="/(auth)" />;
  }

  async function persist(next: NotificationPreferences) {
    setPreferences(next);
    await saveNotificationPreferences(next);
    if (session?.role === 'student' && next.enabled && next.tasks) {
      try {
        const tasks = await requestMobileApi<StudentTasksResponse>(
          '/api/mobile/v1/student/tasks',
        );
        setScheduledCount(await syncTaskDeadlineNotifications(tasks.items));
      } catch {
        setMessage('설정은 저장했지만 과제 알림 예약을 갱신하지 못했습니다.');
      }
    } else {
      setScheduledCount(await getScheduledTaskReminderCount());
    }
  }

  async function toggleEnabled(enabled: boolean) {
    setBusy(true);
    setMessage('');
    try {
      if (enabled) {
        const nextPermission = await requestNotificationPermission();
        setPermission(nextPermission);
        if (nextPermission !== 'granted') {
          setMessage('기기 설정에서 알림 권한을 허용하세요.');
          return;
        }
      }
      await persist({ ...preferences, enabled });
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : '알림 설정을 저장하지 못했습니다.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleCategory(
    key: keyof Omit<NotificationPreferences, 'enabled'>,
    enabled: boolean,
  ) {
    setBusy(true);
    setMessage('');
    try {
      await persist({ ...preferences, [key]: enabled });
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : '알림 설정을 저장하지 못했습니다.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function preview() {
    setBusy(true);
    setMessage('');
    try {
      await scheduleNotificationPreview();
      setMessage('2초 후 알림 미리보기가 표시됩니다.');
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : '알림을 예약하지 못했습니다.',
      );
    } finally {
      setBusy(false);
    }
  }

  const permissionLabel = {
    denied: '차단됨',
    granted: '허용됨',
    undetermined: '허용 필요',
    unsupported: '앱에서 확인',
  }[permission];

  return (
    <AppScreen
      right={
        <Pressable
          accessibilityLabel="뒤로 가기"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <ChevronLeft color={colors.ink} size={24} />
        </Pressable>
      }
      subtitle="기기에서 받을 알림 종류를 관리합니다."
      title="알림 설정">
      <Card>
        <SettingRow
          caption={`기기 권한 ${permissionLabel}`}
          disabled={busy || permission === 'unsupported'}
          icon={BellRing}
          onValueChange={(value) => void toggleEnabled(value)}
          title="알림 받기"
          value={preferences.enabled && permission === 'granted'}
        />
      </Card>

      <SectionTitle>알림 종류</SectionTitle>
      <Card>
        <SettingRow
          caption={
            session?.role === 'student'
              ? `마감 전날·당일 알림 · 예약 ${scheduledCount}건`
              : '학생 제출 및 수정본 알림'
          }
          disabled={busy || !preferences.enabled}
          icon={Clock3}
          onValueChange={(value) => void toggleCategory('tasks', value)}
          title="수행평가"
          value={preferences.enabled && preferences.tasks}
        />
        <Divider />
        <SettingRow
          caption="원격 알림 연결 후 제공"
          disabled={busy || !preferences.enabled}
          icon={BellRing}
          onValueChange={(value) => void toggleCategory('answers', value)}
          title="질의응답"
          value={preferences.enabled && preferences.answers}
        />
        <Divider />
        <SettingRow
          caption="원격 알림 연결 후 제공"
          disabled={busy || !preferences.enabled}
          icon={Settings2}
          onValueChange={(value) => void toggleCategory('mentoring', value)}
          title="멘토링"
          value={preferences.enabled && preferences.mentoring}
        />
      </Card>

      {message ? <Text style={styles.message}>{message}</Text> : null}
      <PrimaryButton disabled={busy} onPress={() => void preview()} variant="secondary">
        알림 미리보기
      </PrimaryButton>
      {permission === 'denied' && Platform.OS !== 'web' ? (
        <PrimaryButton
          disabled={busy}
          onPress={() => void Linking.openSettings()}
          variant="secondary">
          기기 알림 설정 열기
        </PrimaryButton>
      ) : null}
    </AppScreen>
  );
}

function SettingRow({
  caption,
  disabled,
  icon: Icon,
  onValueChange,
  title,
  value,
}: {
  caption: string;
  disabled: boolean;
  icon: typeof BellRing;
  onValueChange: (value: boolean) => void;
  title: string;
  value: boolean;
}) {
  return (
    <View style={[styles.row, disabled && styles.disabled]}>
      <View style={styles.iconBox}>
        <Icon color={colors.blue} size={20} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.caption}>{caption}</Text>
      </View>
      <Switch
        disabled={disabled}
        ios_backgroundColor={colors.line}
        onValueChange={onValueChange}
        thumbColor={colors.surface}
        trackColor={{ false: colors.line, true: colors.primary }}
        value={value}
      />
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 76,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  iconBox: {
    alignItems: 'center',
    backgroundColor: colors.blueSoft,
    borderRadius: 8,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  text: {
    flex: 1,
    gap: 3,
  },
  title: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  caption: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  divider: {
    backgroundColor: colors.line,
    height: StyleSheet.hairlineWidth,
    marginLeft: 64,
  },
  message: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.72,
  },
});
