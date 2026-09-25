import { Clipboard, Platform, Share } from 'react-native';

import { toast } from '@/design';

/**
 * 계좌번호 복사. 새 패키지(expo-clipboard) 없이:
 *  · 웹: navigator.clipboard
 *  · 네이티브: RN 코어 Clipboard(추출 예정이지만 0.85 에 아직 있음) → 실패하면 공유 시트(복사 가능)
 */
export async function copyText(value: string, successMessage = '복사했어요') {
  try {
    if (Platform.OS === 'web') {
      await navigator.clipboard.writeText(value);
    } else {
      Clipboard.setString(value);
    }
    toast(successMessage, 'success');
  } catch {
    try {
      await Share.share({ message: value });
    } catch {
      toast('복사하지 못했어요. 길게 눌러 직접 복사해 주세요', 'error');
    }
  }
}
