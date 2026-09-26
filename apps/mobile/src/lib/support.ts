import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';

import { toast } from '@/design';
import { copyText } from '@/features/lunch/clipboard';

// 고객지원·정책 — 로그인 화면과 계정 화면이 같이 쓴다.
// 페이지는 공개 랜딩(www.kanghanseonbae.com)에 있어 로그아웃 상태에서도 열린다. App Store Connect 의 Support URL·Privacy Policy URL 과 같은 주소.

const SITE_URL = 'https://www.kanghanseonbae.com';

export const SUPPORT_URL = `${SITE_URL}/support.html`;
export const PRIVACY_URL = `${SITE_URL}/privacy.html`;
export const SUPPORT_TEL = '010-3145-5767';
export const SUPPORT_EMAIL = 'kanghanseonbae@naver.com';

/** 고객지원·정책 페이지를 앱 안 브라우저로 연다 */
export async function openHelpPage(url: string) {
  try {
    await WebBrowser.openBrowserAsync(url);
  } catch {
    try {
      await Linking.openURL(url);
    } catch {
      toast('페이지를 열지 못했어요. 잠시 후 다시 시도해 주세요', 'error');
    }
  }
}

/** 전화 문의 — 전화를 걸 수 없는 기기(iPad 등)는 번호를 복사해 준다 */
export async function callSupport() {
  try {
    await Linking.openURL(`tel:${SUPPORT_TEL.replace(/\D/g, '')}`);
  } catch {
    await copyText(SUPPORT_TEL, `전화를 걸 수 없는 기기예요. 번호 ${SUPPORT_TEL}를 복사했어요`);
  }
}

/** 이메일 문의 — 메일 앱이 없거나 계정이 설정되지 않은 기기는 주소를 복사해 준다 */
export async function emailSupport() {
  try {
    await Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('[강한선배 앱] 문의')}`);
  } catch {
    await copyText(SUPPORT_EMAIL, `메일 앱을 열 수 없어요. 주소 ${SUPPORT_EMAIL}를 복사했어요`);
  }
}
