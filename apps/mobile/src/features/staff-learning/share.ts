import * as WebBrowser from 'expo-web-browser';
import { Linking, Platform, Share } from 'react-native';

import { toast } from '@/design';

export type ShareOutcome = 'shared' | 'copied' | 'dismissed' | 'failed';

type WebNavigator = {
  share?: (data: { title?: string; text?: string }) => Promise<void>;
  clipboard?: { writeText: (text: string) => Promise<void> };
};

function webNavigator(): WebNavigator | undefined {
  return (globalThis as { navigator?: WebNavigator }).navigator;
}

/** 클립보드에 복사 (웹 전용 — 네이티브는 공유 시트의 '복사'를 쓴다) */
async function copyOnWeb(text: string, successMessage: string): Promise<ShareOutcome> {
  const nav = webNavigator();
  if (!nav?.clipboard) {
    toast('이 브라우저에서는 복사할 수 없어요', 'error');
    return 'failed';
  }
  try {
    await nav.clipboard.writeText(text);
    toast(successMessage, 'success');
    return 'copied';
  } catch {
    toast('복사하지 못했어요', 'error');
    return 'failed';
  }
}

/**
 * 링크·안내 문구 보내기 — 네이티브는 OS 공유 시트(카카오톡·문자·복사 …),
 * 웹은 Web Share 가 있으면 그것을, 없으면 클립보드 복사.
 */
export async function shareMessage(message: string, title?: string): Promise<ShareOutcome> {
  if (Platform.OS === 'web') {
    const nav = webNavigator();
    if (nav?.share) {
      try {
        await nav.share({ title, text: message });
        return 'shared';
      } catch {
        return 'dismissed';
      }
    }
    return copyOnWeb(message, '복사했어요. 붙여 넣어 보내 주세요');
  }
  try {
    const result = await Share.share(title ? { message, title } : { message });
    return result.action === Share.dismissedAction ? 'dismissed' : 'shared';
  } catch {
    toast('공유하지 못했어요', 'error');
    return 'failed';
  }
}

/** 링크만 복사 — 웹은 클립보드, 네이티브는 공유 시트(복사 포함) */
export async function copyLink(url: string): Promise<ShareOutcome> {
  if (Platform.OS === 'web') return copyOnWeb(url, '링크를 복사했어요');
  return shareMessage(url);
}

/** 문자 앱 열기 — 받는 사람·본문 채워서 */
export async function openSms(phone: string, body: string) {
  const digits = phone.replace(/[^0-9+]/g, '');
  // iOS 는 sms:번호&body=, Android 는 sms:번호?body=
  const sep = Platform.OS === 'ios' ? '&' : '?';
  const url = `sms:${digits}${sep}body=${encodeURIComponent(body)}`;
  try {
    await Linking.openURL(url);
  } catch {
    toast('문자 앱을 열지 못했어요', 'error');
  }
}

/** 첨부 파일·사진·링크 열기 (앱 안 브라우저) */
export async function openUrl(url: string) {
  try {
    await WebBrowser.openBrowserAsync(url);
  } catch {
    try {
      await Linking.openURL(url);
    } catch {
      toast('파일을 열지 못했어요', 'error');
    }
  }
}

/** 010-1234-5678 형태로 */
export function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, '');
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return phone;
}
