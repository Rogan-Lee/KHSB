import { Linking } from 'react-native';

import { toast } from '@/design';

/** 전화·문자 앱 열기 — 번호가 없거나 열 수 없으면 토스트 */
export async function openContact(kind: 'tel' | 'sms', phone: string | null | undefined) {
  const digits = (phone ?? '').replace(/[^\d+]/g, '');
  if (!digits) {
    toast('등록된 번호가 없어요', 'error');
    return;
  }
  try {
    await Linking.openURL(`${kind}:${digits}`);
  } catch {
    toast(kind === 'tel' ? '전화를 걸 수 없어요' : '문자를 보낼 수 없어요', 'error');
  }
}

/** 010-1234-5678 형태로 보기 좋게 */
export function formatPhone(phone: string | null | undefined) {
  const d = (phone ?? '').replace(/\D/g, '');
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return phone ?? '';
}
