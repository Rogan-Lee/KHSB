import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { requestMobileApi } from '@/lib/mobile-api';
import {
  getNotificationPermissionState,
  type NotificationPreferences,
} from '@/lib/notifications';

const PUSH_TOKEN_KEY = 'studyroom.expo-push-token.v1';

export type RemotePushRegistrationState =
  | 'disabled'
  | 'error'
  | 'registered'
  | 'unconfigured'
  | 'unsupported';

function getProjectId() {
  return (
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
    Constants.easConfig?.projectId ??
    (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)
      ?.projectId ??
    null
  );
}

async function deactivateToken(token: string) {
  await requestMobileApi<{ ok: true }>(
    '/api/mobile/v1/notifications/devices',
    {
      body: JSON.stringify({ expoPushToken: token }),
      headers: { 'Content-Type': 'application/json' },
      method: 'DELETE',
    },
  );
}

export async function getRemotePushRegistrationState(): Promise<RemotePushRegistrationState> {
  if (Platform.OS === 'web') return 'unsupported';
  if (!Device.isDevice) return 'unsupported';
  if (!getProjectId()) return 'unconfigured';
  return (await SecureStore.getItemAsync(PUSH_TOKEN_KEY))
    ? 'registered'
    : 'disabled';
}

export async function unregisterRemotePushToken() {
  if (Platform.OS === 'web') return;
  const token = await SecureStore.getItemAsync(PUSH_TOKEN_KEY);
  if (!token) return;
  await deactivateToken(token);
  await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY);
}

export async function syncRemotePushRegistration(
  preferences: NotificationPreferences,
): Promise<RemotePushRegistrationState> {
  if (Platform.OS === 'web' || !Device.isDevice) return 'unsupported';
  if (!preferences.enabled) {
    await unregisterRemotePushToken();
    return 'disabled';
  }

  const permission = await getNotificationPermissionState();
  if (permission !== 'granted') return 'disabled';

  const projectId = getProjectId();
  if (!projectId) return 'unconfigured';

  const Notifications = await import('expo-notifications');
  const expoPushToken = (
    await Notifications.getExpoPushTokenAsync({ projectId })
  ).data;
  const previousToken = await SecureStore.getItemAsync(PUSH_TOKEN_KEY);
  if (previousToken && previousToken !== expoPushToken) {
    await deactivateToken(previousToken).catch(() => undefined);
  }

  await requestMobileApi<{ ok: true }>(
    '/api/mobile/v1/notifications/devices',
    {
      body: JSON.stringify({
        appVersion: Constants.expoConfig?.version ?? null,
        deviceName: Device.modelName,
        enabled: true,
        expoPushToken,
        platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
        preferences: {
          answers: preferences.answers,
          mentoring: preferences.mentoring,
          tasks: preferences.tasks,
        },
        projectId,
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    },
  );
  await SecureStore.setItemAsync(PUSH_TOKEN_KEY, expoPushToken);
  return 'registered';
}
