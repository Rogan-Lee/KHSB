import * as WebBrowser from 'expo-web-browser';
import { Linking, Platform } from 'react-native';

import { toast } from '@/design';
import { isWebUrl } from '@/lib/safe-url';

/**
 * 결제 페이지를 연 결과 — 결제 확인을 언제 할지가 여기서 갈린다.
 *  · closed — 앱 안 브라우저가 닫힌 뒤에 끝났다 (iOS: 시트를 닫아야 promise 가 끝난다) → 바로 확인
 *  · away   — 앱 밖에서 열렸다 (Android 커스텀 탭은 열자마자 promise 가 끝난다 · 웹 새 탭 · 기본 브라우저)
 *             → 앱이 다시 활성화될 때 확인
 *  · failed — 열지 못했다
 */
export type PayPageResult = 'closed' | 'away' | 'failed';

export async function openPayPage(url: string): Promise<PayPageResult> {
  // 서버가 준 링크는 http(s) 만 연다
  if (!isWebUrl(url)) return 'failed';
  if (Platform.OS !== 'web') {
    try {
      // iOS 기본 "완료" 버튼은 결제가 끝난 것처럼 읽혀서 "닫기" 로 바꾼다
      const result = await WebBrowser.openBrowserAsync(url, {
        dismissButtonStyle: 'close',
      });
      return result.type === WebBrowser.WebBrowserResultType.OPENED ? 'away' : 'closed';
    } catch {
      // 앱 안 브라우저를 못 쓰는 기기 → 아래 기본 브라우저로
    }
  }
  try {
    await Linking.openURL(url);
    return 'away';
  } catch {
    return 'failed';
  }
}

/** 영수증 등 서버가 준 웹 페이지 열기 — 앱 안 브라우저, 웹은 새 탭 */
export async function openReceipt(url: string | null | undefined) {
  if (!isWebUrl(url)) {
    toast('영수증을 열지 못했어요', 'error');
    return;
  }
  try {
    if (Platform.OS === 'web') {
      await Linking.openURL(url);
      return;
    }
    await WebBrowser.openBrowserAsync(url);
  } catch {
    try {
      await Linking.openURL(url);
    } catch {
      toast('영수증을 열지 못했어요', 'error');
    }
  }
}
