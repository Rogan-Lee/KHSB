import * as SecureStore from 'expo-secure-store';
import { router, useSegments } from 'expo-router';
import type { Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { buildTaskReminderSchedule } from '@/lib/notification-reminders';
import { resolveNotificationHref } from '@/lib/notification-routes';
import { selectParentChild } from '@/lib/parent-child';
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

/**
 * 기기 알림 설정. tasks·answers·mentoring 은 서버 DevicePushToken 의 채널 플래그
 * (tasksEnabled·questionsEnabled·mentoringEnabled) 로 그대로 올라간다 — push-registration.ts.
 * 역할마다 같은 채널을 다른 이름으로 보여 준다 (NOTIFICATION_CATEGORIES).
 */
export type NotificationPreferences = {
  enabled: boolean;
  /** 서버 TASK 채널 */
  tasks: boolean;
  /** 서버 QUESTION 채널 */
  answers: boolean;
  /** 서버 MENTORING 채널 */
  mentoring: boolean;
  /** 학생: 마감 전날 저녁 알림 (기기 로컬 예약) */
  reminderDayBefore: boolean;
  /** 학생: 마감 당일 아침 알림 (기기 로컬 예약) */
  reminderSameDay: boolean;
};

export type NotificationChannel = 'tasks' | 'answers' | 'mentoring';

export type NotificationCategory = {
  channel: NotificationChannel;
  title: string;
  description: string;
};

export type NotificationRole = 'student' | 'staff' | 'parent';

/**
 * 역할별 알림 종류 ↔ 서버 푸시 category 대응표.
 * 서버(src/lib/mobile-push.ts)가 보낼 때 아래 category 를 써야 해당 스위치로 끌 수 있다.
 * SYSTEM category(공지·직원 메시지)는 스위치와 관계없이 '알림 받기'가 켜져 있으면 항상 간다.
 *
 *  학생   TASK=수행평가 피드백 · QUESTION=질문 답변 · MENTORING=메시지(담당 선생님 채팅)
 *  직원   QUESTION=학생 질문 · MENTORING=멘토링 · TASK=승인 요청(수행평가 제출·학생 신청)
 *  학부모 TASK=입퇴실 · MENTORING=리포트 (QUESTION 은 학부모에게 보내지 않음)
 */
export const NOTIFICATION_CATEGORIES: Record<NotificationRole, NotificationCategory[]> = {
  student: [
    { channel: 'tasks', title: '수행평가', description: '피드백이나 수정 요청이 오면 알려 드려요' },
    { channel: 'answers', title: '질문 답변', description: '선생님이 질문에 답하면 알려 드려요' },
    { channel: 'mentoring', title: '메시지', description: '담당 선생님이 메시지를 보내면 알려 드려요' },
  ],
  staff: [
    { channel: 'answers', title: '학생 질문', description: '담당 학생이 질문을 올리면 알려 드려요' },
    { channel: 'mentoring', title: '멘토링', description: '멘토링 일정과 기록 관련 알림이에요' },
    { channel: 'tasks', title: '승인 요청', description: '수행평가 제출이나 학생 신청이 들어오면 알려 드려요' },
  ],
  parent: [
    { channel: 'tasks', title: '입퇴실', description: '자녀가 독서실에 들어오고 나갈 때 알려 드려요' },
    { channel: 'mentoring', title: '리포트', description: '새 멘토링 리포트가 올라오면 알려 드려요' },
  ],
};

/** 스위치 없이 항상 받는 알림 (서버 SYSTEM category) */
export const ALWAYS_ON_CATEGORY: Record<NotificationRole, Omit<NotificationCategory, 'channel'>> = {
  student: { title: '공지·중요 안내', description: '알림을 켜 두면 항상 보내 드려요' },
  staff: { title: '직원 메시지·공지', description: '알림을 켜 두면 항상 보내 드려요' },
  parent: { title: '공지·중요 안내', description: '독서실 공지와 중요한 안내는 항상 보내 드려요' },
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
  reminderDayBefore: true,
  reminderSameDay: true,
  tasks: true,
};

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
    description: '수행평가 마감, 답변, 출결 등 강한선배 알림',
    importance: Notifications.AndroidImportance.DEFAULT,
    name: '강한선배 알림',
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

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  if (Platform.OS === 'web') return DEFAULT_PREFERENCES;
  const raw = await SecureStore.getItemAsync(PREFERENCES_KEY);
  if (!raw) return DEFAULT_PREFERENCES;
  try {
    const stored = JSON.parse(raw) as Partial<NotificationPreferences>;
    // 예전 버전은 '수행평가' 스위치 하나로 마감 알림까지 껐다 — 그 선택을 이어받는다
    const legacyTasks = typeof stored.tasks === 'boolean' ? stored.tasks : true;
    return {
      ...DEFAULT_PREFERENCES,
      reminderDayBefore: legacyTasks,
      reminderSameDay: legacyTasks,
      ...stored,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function remindersOn(preferences: NotificationPreferences) {
  return preferences.enabled && (preferences.reminderDayBefore || preferences.reminderSameDay);
}

export async function saveNotificationPreferences(
  preferences: NotificationPreferences,
) {
  if (Platform.OS !== 'web') {
    await SecureStore.setItemAsync(PREFERENCES_KEY, JSON.stringify(preferences));
  }
  if (!remindersOn(preferences)) {
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

/** 학생 수행평가 마감 알림을 기기에 다시 예약한다. 예약한 개수를 돌려준다. */
export async function syncTaskDeadlineNotifications(tasks: TaskReminderItem[]) {
  if (Platform.OS === 'web') return 0;
  const Notifications = await getNotifications();
  const [preferences, permission] = await Promise.all([
    getNotificationPreferences(),
    getNotificationPermissionState(),
  ]);
  await cancelTaskDeadlineNotifications();
  if (!remindersOn(preferences) || permission !== 'granted') {
    return 0;
  }

  await ensureReminderChannel(Notifications);
  let scheduledCount = 0;
  const schedule = buildTaskReminderSchedule(tasks, new Date(), 50, {
    dayBefore: preferences.reminderDayBefore,
    sameDay: preferences.reminderSameDay,
  });
  for (const reminder of schedule) {
    await Notifications.scheduleNotificationAsync({
      content: {
        body: `${reminder.task.subject} · ${reminder.task.title}`,
        data: {
          source: TASK_REMINDER_SOURCE,
          taskId: reminder.task.id,
          url: '/(student)/(tabs)/tasks',
        },
        sound: 'default',
        title: `수행평가 마감이 ${reminder.label}이에요`,
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
    throw new Error('알림 미리보기는 iOS·Android 앱에서 확인할 수 있어요.');
  }
  const permission = await requestNotificationPermission();
  if (permission !== 'granted') {
    throw new Error('알림 권한을 허용해야 미리보기를 받을 수 있어요.');
  }
  const Notifications = await getNotifications();
  await Notifications.scheduleNotificationAsync({
    content: {
      body: '알림이 잘 도착했어요. 새 소식이 생기면 이렇게 알려 드릴게요.',
      data: { source: 'studyroom-preview', url: '/notifications' },
      title: '강한선배',
    },
    trigger: {
      channelId: REMINDER_CHANNEL,
      seconds: 2,
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
    },
  });
}

// ─── 알림 탭 → 화면 이동 (경로 허용 목록은 notification-routes.ts) ───────────────

export { resolveNotificationHref };

const ROLE_GROUPS = new Set(['(student)', '(staff)', '(parent)']);
/** 로그인 뒤에만 보이는 화면 — 여기 있을 때 알림을 열어도 된다 */
const SIGNED_IN_SEGMENTS = new Set([...ROLE_GROUPS, 'notifications', 'account']);

/**
 * 알림을 눌렀을 때 해당 화면으로 이동. 루트 레이아웃에서 한 번 호출.
 * 앱이 알림으로 처음 켜질 때는 세션 확인 → 역할 홈 이동이 끝난 뒤(현재 화면이 역할 그룹 안일 때) 연다.
 * 다른 역할의 경로(예: 학부모 계정에 학생 경로)는 무시한다.
 */
export function useNotificationRouting() {
  const segments = useSegments() as string[];
  const group = segments[0] ?? '';
  const pendingRef = useRef<string | null>(null);
  const handledRef = useRef(new Set<string>());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let active = true;
    let subscription: { remove: () => void } | null = null;

    const handle = (notification: Notification) => {
      const id = notification.request.identifier;
      if (handledRef.current.has(id)) return;
      handledRef.current.add(id);
      const data = notification.request.content.data as Record<string, unknown> | undefined;
      const href = resolveNotificationHref(data);
      if (!href) return;
      // 학부모 알림은 해당 자녀 화면으로 — 이동 전에 선택 자녀를 바꿔 둔다
      if (href.startsWith('/(parent)') && typeof data?.studentId === 'string') {
        selectParentChild(data.studentId);
      }
      pendingRef.current = href;
      setTick((value) => value + 1);
    };

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
        handle(lastResponse.notification);
        Notifications.clearLastNotificationResponse();
      }
      subscription = Notifications.addNotificationResponseReceivedListener(
        (response) => handle(response.notification),
      );
    });
    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);

  useEffect(() => {
    const href = pendingRef.current;
    if (!href || !SIGNED_IN_SEGMENTS.has(group)) return;
    pendingRef.current = null;
    const targetGroup = href.match(/^\/(\((?:student|staff|parent)\))/)?.[1];
    if (targetGroup && ROLE_GROUPS.has(group) && targetGroup !== group) return;
    try {
      router.push(href as Href);
    } catch (error) {
      console.warn('[notification-routing]', error);
    }
  }, [tick, group]);
}
