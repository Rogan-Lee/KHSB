import { useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import {
  Avatar,
  color,
  ImageViewer,
  Markdown,
  parseMarkdown,
  Press,
  radius,
  Skeleton,
  space,
  TABLET_CONTENT_WIDTH,
  Text,
  useResponsive,
  type MarkdownBlock,
} from '@/design';
import type { StudentContentDetail } from '@/lib/api/student-contents';

import { CoverImage } from './content-card';
import { contentDateLabel, ContentTypeBadge } from './meta';

const PHONE_WIDTH = 480;
const GUTTER = space.x4;

/** 본문 속 사진 주소 (목록·인용 안쪽까지) — 사진 뷰어에서 좌우로 넘기기 위해 */
function collectImages(blocks: MarkdownBlock[], out: string[] = []): string[] {
  for (const b of blocks) {
    if (b.t === 'image') out.push(b.src);
    else if (b.t === 'quote') collectImages(b.blocks, out);
    else if (b.t === 'list') {
      for (const it of b.items) if (it.children) collectImages([it.children], out);
    }
  }
  return out;
}

/** 표지는 화면 폭 가득(좌우 여백 무시) 16:10, 최대 256 높이 — 웹 ImageFrame ratio 16/10 maxHeight 256 */
function useHeroHeight() {
  const { width } = useWindowDimensions();
  const { isTablet } = useResponsive();
  const inner = Math.min(width - GUTTER * 2, isTablet ? TABLET_CONTENT_WIDTH : PHONE_WIDTH);
  return Math.min(256, Math.round((inner + GUTTER * 2) / 1.6));
}

/**
 * 콘텐츠 상세 본문 — 웹 /s/[token]/contents/[id] 와 같은 순서:
 * 표지 → 유형·날짜 → 제목 → 작성자 → 요약(회색 상자) → 본문(마크다운). 사진은 눌러서 크게 본다.
 */
export function ContentDetailView({ post }: { post: StudentContentDetail }) {
  const heroHeight = useHeroHeight();
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const images = useMemo(() => {
    const body = post.body ? collectImages(parseMarkdown(post.body)) : [];
    const all = post.coverImageUrl ? [post.coverImageUrl, ...body] : body;
    return [...new Set(all)];
  }, [post.body, post.coverImageUrl]);

  const openImage = (src: string) => {
    const i = images.indexOf(src);
    if (i >= 0) setViewerIndex(i);
  };

  return (
    <View>
      {post.coverImageUrl && (
        <Press
          onPress={() => openImage(post.coverImageUrl!)}
          scale={0}
          accessibilityRole="imagebutton"
          accessibilityLabel="표지 사진 크게 보기"
          style={s.hero}>
          <CoverImage uri={post.coverImageUrl} style={{ height: heroHeight }} />
        </Press>
      )}

      <View style={[s.metaRow, !post.coverImageUrl && { paddingTop: space.x3 }]}>
        <ContentTypeBadge type={post.type} label={post.typeLabel} />
        <Text variant="t3-regular" color="neutralSubtle" tabular>
          {contentDateLabel(post.publishedAt)}
        </Text>
      </View>

      <Text variant="t10-bold" accessibilityRole="header" style={{ marginTop: space.x3 }}>
        {post.title}
      </Text>

      {post.authorName && (
        <View style={s.author}>
          <Avatar name={post.authorName} size={32} />
          <Text variant="t4-regular" color="neutralSubtle" style={{ flex: 1, minWidth: 0 }}>
            <Text variant="t4-bold" color="neutralMuted">
              {post.authorName}
            </Text>
            {post.authorRole ? ` · ${post.authorRole}` : ''}
          </Text>
        </View>
      )}

      {post.summary && (
        <View style={s.summary}>
          <Text variant="t5-regular" color="neutralMuted" selectable>
            {post.summary}
          </Text>
        </View>
      )}

      {post.body && <Markdown source={post.body} onImagePress={openImage} style={{ marginTop: space.x6 }} />}

      <ImageViewer images={images} index={viewerIndex} onIndexChange={setViewerIndex} onClose={() => setViewerIndex(null)} />
    </View>
  );
}

export function ContentDetailSkeleton() {
  const heroHeight = useHeroHeight();
  return (
    <View>
      <Skeleton style={[s.hero, { height: heroHeight, borderRadius: 0 }]} />
      <View style={s.metaRow}>
        <Skeleton style={{ width: 56, height: 24, borderRadius: radius.r1_5 }} />
        <Skeleton style={{ width: 96, height: 14 }} />
      </View>
      <Skeleton style={{ width: '90%', height: 30, marginTop: space.x3 }} />
      <Skeleton style={{ width: '60%', height: 30, marginTop: space.x2 }} />
      <View style={s.author}>
        <Skeleton style={{ width: 32, height: 32, borderRadius: 16 }} />
        <Skeleton style={{ width: 140, height: 16 }} />
      </View>
      <View style={{ marginTop: space.x6, gap: space.x3 }}>
        {['100%', '96%', '88%', '100%', '72%'].map((w, i) => (
          <Skeleton key={i} style={{ width: w as `${number}%`, height: 18 }} />
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  // Screen 본문 여백(좌우 x4 · 위 x1)을 넘어 화면 폭 가득
  hero: { marginHorizontal: -GUTTER, marginTop: -space.x1, marginBottom: space.x6, overflow: 'hidden' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.x2 },
  author: { flexDirection: 'row', alignItems: 'center', gap: space.x2_5, marginTop: space.x4 },
  summary: {
    marginTop: space.x6,
    borderRadius: radius.r4,
    backgroundColor: color.bg.layerFill,
    paddingHorizontal: space.x4,
    paddingVertical: space.x3_5,
  },
});
