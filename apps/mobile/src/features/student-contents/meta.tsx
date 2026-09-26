import {
  MessageSquareQuote,
  Newspaper,
  PenLine,
  Podcast,
  ScrollText,
  type LucideIcon,
} from 'lucide-react-native';
import { Linking, StyleSheet, View } from 'react-native';

import { radius, space, Text, toast, TONE_SOFT, type Tone } from '@/design';
import type { ContentType } from '@/lib/api/student-contents';
import { isWebUrl } from '@/lib/safe-url';

// 웹 학생 포털 contents 페이지와 같은 유형 아이콘·색 (CONTENT_TYPE_META 색 계열을 SEED 톤으로)

export const TYPE_ICON: Record<ContentType, LucideIcon> = {
  review: MessageSquareQuote,
  mentor: PenLine,
  director: ScrollText,
  podcast: Podcast,
  article: Newspaper,
};

export const TYPE_TONE: Record<ContentType, Tone> = {
  review: 'warn',
  mentor: 'violet',
  director: 'brand',
  podcast: 'info',
  article: 'ok',
};

/** 유형 배지 — 웹 h-x6 rounded-r1_5 px-x2 t2-bold (목록은 아이콘 포함) */
export function ContentTypeBadge({
  type,
  label,
  withIcon = false,
}: {
  type: ContentType;
  label: string;
  withIcon?: boolean;
}) {
  const c = TONE_SOFT[TYPE_TONE[type]];
  const Icon = TYPE_ICON[type];
  return (
    <View style={[s.badge, { backgroundColor: c.bg }]}>
      {withIcon && <Icon color={c.fg} size={12} strokeWidth={2.5} />}
      <Text variant="t2-bold" color={c.fg} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const KST_MS = 9 * 60 * 60 * 1000;

/** ISO → "2026년 9월 25일" (KST) — 웹 toLocaleDateString(year numeric, month long, day numeric) */
export function contentDateLabel(iso: string) {
  const d = new Date(new Date(iso).getTime() + KST_MS);
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

/** 원문·팟캐스트·영상 링크는 앱 밖(브라우저·유튜브 등 해당 앱)에서 연다 */
export async function openExternal(url: string) {
  if (!isWebUrl(url)) {
    toast('링크를 열지 못했어요', 'error');
    return;
  }
  try {
    await Linking.openURL(url);
  } catch {
    toast('링크를 열지 못했어요', 'error');
  }
}

const s = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.x1,
    minHeight: space.x6,
    paddingHorizontal: space.x2,
    borderRadius: radius.r1_5,
  },
});
