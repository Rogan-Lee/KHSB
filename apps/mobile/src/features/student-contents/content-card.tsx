import { Image } from 'expo-image';
import { ArrowUpRight, ChevronRight, ImageOff } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { color, Press, radius, Skeleton, space, Text } from '@/design';
import type { StudentContentItem } from '@/lib/api/student-contents';

import { contentDateLabel, ContentTypeBadge } from './meta';

/** 표지 사진 — 불러오는 중엔 회색 바탕, 깨지면 빈 사진 아이콘 (웹 ImageFrame + ContentPlaceholder) */
export function CoverImage({
  uri,
  ratio,
  style,
}: {
  uri: string;
  /** 가로:세로 비율 — 없으면 style 의 height 를 쓴다 */
  ratio?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <View style={[s.cover, ratio ? { aspectRatio: ratio } : null, style]}>
      {failed ? (
        <ImageOff color={color.fg.placeholder} size={28} strokeWidth={1.8} />
      ) : (
        <Image
          source={{ uri }}
          contentFit="cover"
          transition={150}
          style={StyleSheet.absoluteFill}
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
        />
      )}
    </View>
  );
}

/**
 * 콘텐츠 카드 — 표지(16:9) · 유형 배지 · 제목(→ 또는 ↗) · 요약 2줄 · 날짜·작성자.
 * 외부 링크형은 ↗ (원문을 바로 연다), 앱에서 읽는 글은 >.
 */
export function ContentCard({ item, onPress }: { item: StudentContentItem; onPress: () => void }) {
  const external = item.externalUrl != null;
  const Trailing = external ? ArrowUpRight : ChevronRight;
  return (
    <Press
      onPress={onPress}
      pressedBg={color.bg.layerDefaultPressed}
      accessibilityRole={external ? 'link' : 'button'}
      accessibilityLabel={`${item.typeLabel}, ${item.title}${external ? ', 외부 링크' : ''}`}
      style={s.card}>
      {item.coverImageUrl && <CoverImage uri={item.coverImageUrl} ratio={16 / 9} />}
      <View style={[s.body, { paddingTop: item.coverImageUrl ? space.x4 : space.x5 }]}>
        <ContentTypeBadge type={item.type} label={item.typeLabel} withIcon />
        <View style={s.titleRow}>
          <Text variant="t6-bold" style={{ flex: 1, minWidth: 0 }}>
            {item.title}
          </Text>
          <Trailing color={color.fg.placeholder} size={20} strokeWidth={2.2} style={{ marginTop: 2 }} />
        </View>
        {item.summary && (
          <Text variant="t4-regular" color="neutralSubtle" numberOfLines={2} style={{ marginTop: space.x1_5 }}>
            {item.summary}
          </Text>
        )}
        <Text variant="t3-regular" color="neutralSubtle" tabular style={{ marginTop: space.x3 }}>
          {contentDateLabel(item.publishedAt)}
          {item.authorName ? ` · ${item.authorName}` : ''}
        </Text>
      </View>
    </Press>
  );
}

export function ContentCardSkeleton() {
  return (
    <View style={s.card}>
      <Skeleton style={{ aspectRatio: 16 / 9, borderRadius: 0 }} />
      <View style={[s.body, { paddingTop: space.x4, gap: space.x2_5 }]}>
        <Skeleton style={{ width: 72, height: 24, borderRadius: radius.r1_5 }} />
        <Skeleton style={{ width: '85%', height: 22 }} />
        <Skeleton style={{ width: '60%', height: 16 }} />
        <Skeleton style={{ width: 120, height: 14, marginTop: space.x1 }} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  // flexGrow — 태블릿 그리드에서 한 줄의 카드 높이를 맞춘다
  card: { flexGrow: 1, overflow: 'hidden', borderRadius: radius.r5, backgroundColor: color.bg.layerDefault },
  cover: {
    width: '100%',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bg.neutralWeak,
  },
  body: { paddingHorizontal: space.x5, paddingBottom: space.x5 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.x1_5, marginTop: space.x2_5 },
});
