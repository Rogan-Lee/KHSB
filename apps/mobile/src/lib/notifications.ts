import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import type { Href } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { buildTaskReminderSchedule } from '@/lib/notification-reminders';
import type { TaskReminderItem } from '@/lib/notification-reminders';

const PREFERENCES_KEY = 'studyroom.notification-preferences.v1';
const TASK_REMINDER_SOURCE = 'studyroom-task-reminder';
const REMINDER_CHANNEL = 'reminders';
const IOS_GRANTED_STATUSES = new Set([2, 3, 4]);

type ExpoNotifications = typeof import('expo-notifications');
type Notification = import('expo-notifications').Notification;
type NotificationPermissionsStatus =
  import('expo-notifications').NotificationPermissionsStatus;

let notificationsPromise: Promise<ExpoNotifications> | null = null;

export type NotificationPreferences = {
  answers: boolean;
  enabled: boolean;
  mentoring: boolean;
  tasks: boolean;
};

export type NotificationPermissionState =
  | 'denied'
  | 'granted'
  | 'undetermined'
  | 'unsupported';

const DEFAULT_PREFERENCES: NotificationPreferences = {
  answers: true,
  enabled: false,
  mentoring: true,
  tasks: true,
};

const ALLOWED_NOTIFICATION_ROUTES = new Set([
  '/(staff)/qna',
  '/(student)/qna',
  '/notifications',
  '/staff-tasks',
  '/student-tasks',
]);

function getNotifications() {
  notificationsPromise ??= import('expo-notifications');
  return notificationsPromise;
}

function permissionGranted(status: NotificationPermissionsStatus) {
  if (Platform.OS !== 'ios') return status.granted;
  return IOS_GRANTED_STATUSES.has(status.ios?.status ?? 0);
}

async function ensureReminderChannel(Notifications: ExpoNotifications) {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, {
    description: '수행평가 마감과 학습 일정 알림',
    importance: Notifications.AndroidImportance.DEFAULT,
    name: '학습 일정 알림',
    vibrationPattern: [0, 180],
  });
}

export async function getNotificationPermissionState(): Promise<NotificationPermissionState> {
  if (Platform.OS === 'web') return 'unsupported';
  const Notifications = await getNotifications();
  const status = await Notifications.getPermissionsAsync();
  if (permissionGranted(status)) return 'granted';
  return status.canAskAgain ? 'undetermined' : 'denied';
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (Platform.OS === 'web') return 'unsupported';
  const Notifications = await getNotifications();
  await ensureReminderChannel(Notifications);
  const current = await Notifications.getPermissionsAsync();
  const status = permissionGranted(current)
    ? current
    : await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
  if (permissionGranted(status)) return 'granted';
  return status.canAskAgain ? 'undetermined' : 'denied';
}

export async function getNotificationPreferences() {
  if (Platform.OS === 'web') return DEFAULT_PREFERENCES;
  const raw = await SecureStore.getItemAsync(PREFERENCES_KEY);
  if (!raw) return DEFAULT_PREFERENCES;
  try {
    return { ...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as NotificationPreferences) };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export async function saveNotificationPreferences(
  preferences: NotificationPreferences,
) {
  if (Platform.OS !== 'web') {
    await SecureStore.setItemAsync(PREFERENCES_KEY, JSON.stringify(preferences));
  }
  if (!preferences.enabled || !preferences.tasks) {
    await cancelTaskDeadlineNotifications();
  }
}

export async function getScheduledTaskReminderCount() {
  if (Platform.OS === 'web') return 0;
  const Notifications = await getNotifications();
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled.filter(
    (notification) =>
      notification.content.data?.source === TASK_REMINDER_SOURCE,
  ).length;
}

export async function cancelTaskDeadlineNotifications() {
  if (Platform.OS === 'web') return;
  const Notifications = await getNotifications();
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter(
        (notification) =>
          notification.content.data?.source === TASK_REMINDER_SOURCE,
      )
      .map((notification) =>
        Notifications.cancelScheduledNotificationAsync(notification.identifier),
      ),
  );
}

export async function syncTaskDeadlineNotifications(tasks: TaskReminderItem[]) {
  if (Platform.OS === 'web') return 0;
  const Notifications = await getNotifications();
  const [preferences, permission] = await Promise.all([
    getNotificationPreferences(),
    getNotificationPermissionState(),
  ]);
  await cancelTaskDeadlineNotifications();
  if (
    !preferences.enabled ||
    !preferences.tasks ||
    permission !== 'granted'
  ) {
    return 0;
  }

  await ensureReminderChannel(Notifications);
  let scheduledCount = 0;
  for (const reminder of buildTaskReminderSchedule(tasks)) {
    await Notifications.scheduleNotificationAsync({
      content: {
        body: `${reminder.label} "${reminder.task.title}" 제출 마감입니다.`,
        data: {
          source: TASK_REMINDER_SOURCE,
          taskId: reminder.task.id,
          url: '/student-tasks',
        },
        sound: 'default',
        title: `${reminder.task.subject} 수행평가 마감`,
      },
      trigger: {
        channelId: REMINDER_CHANNEL,
        date: reminder.date,
        type: Notifications.SchedulableTriggerInputTypes.DATE,
      },
    });
    scheduledCount += 1;
  }
  return scheduledCount;
}

export async function scheduleNotificationPreview() {
  if (Platform.OS === 'web') {
    throw new Error('알림 미리보기는 iOS 또는 Android 앱에서 확인하세요.');
  }
  const permission = await requestNotificationPermission();
  if (permission !== 'granted') {
    throw new Error('알림 권한을 허용해야 미리보기를 받을 수 있습니다.');
  }
  const Notifications = await getNotifications();
  await Notifications.scheduleNotificationAsync({
    content: {
      body: '알림 설정이 정상적으로 적용되었습니다.',
      data: { source: 'studyroom-preview', url: '/notifications' },
      title: '스터디룸 매니저',
    },
    trigger: {
      channelId: REMINDER_CHANNEL,
      seconds: 2,
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
    },
  });
}

function openNotification(notification: Notification) {
  const url = notification.request.content.data?.url;
  if (typeof url !== 'string' || !ALLOWED_NOTIFICATION_ROUTES.has(url)) return;
  router.push(url as Href);
}

export function useNotificationRouting() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let active = true;
    let subscription: { remove: () => void } | null = null;
    void getNotifications().then((Notifications) => {
      if (!active) return;
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldPlaySound: false,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
      const lastResponse = Notifications.getLastNotificationResponse();
      if (lastResponse?.notification) {
        openNotification(lastResponse.notification);
        Notifications.clearLastNotificationResponse();
      }
      subscription = Notifications.addNotificationResponseReceivedListener(
        (response) => openNotification(response.notification),
      );
    });
    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);
}
