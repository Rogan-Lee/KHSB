import { Image } from 'expo-image';
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { parseMarkdown, type Block, type Inline } from './markdown-parse';
import { Press } from './press';
import { Text } from './text';
import { color, radius, space } from './tokens';

/**
 * 긴 글(마크다운) — 웹 <Prose>(.seed-prose) 와 같은 규칙. 리포트·공지·콘텐츠를 앱 안에서 읽을 때 쓴다.
 * size md = 본문 16px · 행간 1.75 (학부모 리포트), sm = 14px · 1.7 (카드 안 보조 글)
 */
export function Markdown({
  source,
  size = 'md',
  onImagePress,
  style,
}: {
  source: string | null | undefined;
  size?: 'md' | 'sm';
  /** 이미지 탭 (전체 화면 보기 등). 없으면 탭 불가 */
  onImagePress?: (src: string) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  if (blocks.length === 0) return null;
  const m = METRICS[size];
  return (
    <View style={style}>
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} m={m} first={i === 0} onImagePress={onImagePress} />
      ))}
    </View>
  );
}

type M = { font: number; line: number; gap: number; color: string };
const METRICS: Record<'md' | 'sm', M> = {
  md: { font: 16, line: 28, gap: 12, color: color.fg.neutral },
  sm: { font: 14, line: 24, gap: 10, color: color.fg.neutralMuted },
};

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

function BlockView({
  block,
  m,
  first,
  onImagePress,
}: {
  block: Block;
  m: M;
  first: boolean;
  onImagePress?: (src: string) => void;
}) {
  const top = first ? 0 : m.gap;
  switch (block.t) {
    case 'heading': {
      const size = block.level === 1 ? 20 : block.level === 2 ? 20 : 18;
      return (
        <Text
          variant="t6-bold"
          style={{ fontSize: m.font === 14 ? 16 : size, lineHeight: (m.font === 14 ? 16 : size) * 1.45, marginTop: first ? 0 : m.gap * 2 }}
          accessibilityRole="header">
          <Inlines nodes={block.c} m={m} />
        </Text>
      );
    }
    case 'paragraph':
      return (
        <Text style={[base(m), { marginTop: top }]}>
          <Inlines nodes={block.c} m={m} />
        </Text>
      );
    case 'list':
      return <ListView block={block} m={m} top={top} onImagePress={onImagePress} />;
    case 'quote':
      return (
        <View style={[s.quote, { marginTop: top }]}>
          {block.blocks.map((b, i) => (
            <BlockView key={i} block={b} m={{ ...m, color: color.fg.neutralMuted }} first={i === 0} onImagePress={onImagePress} />
          ))}
        </View>
      );
    case 'hr':
      return <View style={[s.hr, { marginVertical: m.gap * 1.5 }]} />;
    case 'code':
      return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[s.code, { marginTop: top }]}>
          <Text style={{ fontFamily: MONO, fontSize: m.font - 2, lineHeight: (m.font - 2) * 1.6, color: color.fg.neutral }}>
            {block.v}
          </Text>
        </ScrollView>
      );
    case 'image':
      return <MdImage src={block.src} alt={block.alt} top={top} onPress={onImagePress} />;
    case 'table':
      return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: top }}>
          <View style={s.table}>
            <View style={[s.tr, { backgroundColor: color.bg.layerFill }]}>
              {block.head.map((c, i) => (
                <View key={i} style={s.td}>
                  <Text variant="t4-bold" color="neutralMuted">
                    <Inlines nodes={c} m={m} />
                  </Text>
                </View>
              ))}
            </View>
            {block.rows.map((row, ri) => (
              <View key={ri} style={s.tr}>
                {block.head.map((_, ci) => (
                  <View key={ci} style={s.td}>
                    <Text variant="t4-regular">
                      <Inlines nodes={row[ci] ?? []} m={m} />
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      );
  }
}

function ListView({
  block,
  m,
  top,
  onImagePress,
}: {
  block: Extract<Block, { t: 'list' }>;
  m: M;
  top: number;
  onImagePress?: (src: string) => void;
}) {
  return (
    <View style={{ marginTop: top, gap: m.gap / 2 }}>
      {block.items.map((it, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: space.x2 }}>
          <Text style={[base(m), { color: color.fg.neutralSubtle, minWidth: block.ordered ? 20 : 12 }]} tabular>
            {block.ordered ? `${block.start + i}.` : '•'}
          </Text>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={base(m)}>
              <Inlines nodes={it.content} m={m} />
            </Text>
            {it.children && <BlockView block={it.children} m={m} first={false} onImagePress={onImagePress} />}
          </View>
        </View>
      ))}
    </View>
  );
}

function Inlines({ nodes, m }: { nodes: Inline[]; m: M }): ReactNode {
  return nodes.map((n, i) => {
    switch (n.t) {
      case 'text':
        return <Fragment key={i}>{n.v}</Fragment>;
      case 'br':
        return <Fragment key={i}>{'\n'}</Fragment>;
      case 'bold':
        return (
          <Text key={i} style={{ fontWeight: '700', color: color.fg.neutral }}>
            <Inlines nodes={n.c} m={m} />
          </Text>
        );
      case 'italic':
        return (
          <Text key={i} style={{ fontStyle: 'italic' }}>
            <Inlines nodes={n.c} m={m} />
          </Text>
        );
      case 'strike':
        return (
          <Text key={i} style={{ textDecorationLine: 'line-through', color: color.fg.neutralSubtle }}>
            <Inlines nodes={n.c} m={m} />
          </Text>
        );
      case 'code':
        return (
          <Text
            key={i}
            style={{ fontFamily: MONO, fontSize: m.font - 2, backgroundColor: color.bg.neutralWeak, color: color.fg.neutral }}>
            {` ${n.v} `}
          </Text>
        );
      case 'link':
        return (
          <Text
            key={i}
            accessibilityRole="link"
            onPress={() => {
              if (/^https?:\/\//i.test(n.href)) void Linking.openURL(n.href).catch(() => undefined);
            }}
            style={{ color: color.fg.informative, textDecorationLine: 'underline' }}>
            <Inlines nodes={n.c} m={m} />
          </Text>
        );
    }
  });
}

function MdImage({
  src,
  alt,
  top,
  onPress,
}: {
  src: string;
  alt: string;
  top: number;
  onPress?: (src: string) => void;
}) {
  const [ratio, setRatio] = useState(4 / 3);
  const img = (
    <Image
      source={{ uri: src }}
      accessibilityLabel={alt || '첨부 이미지'}
      contentFit="cover"
      transition={150}
      onLoad={(e) => {
        const { width, height } = e.source;
        if (width && height) setRatio(width / height);
      }}
      style={{ width: '100%', aspectRatio: ratio, borderRadius: radius.r3, backgroundColor: color.bg.neutralWeak }}
    />
  );
  return (
    <View style={{ marginTop: top }}>
      {onPress ? (
        <Press onPress={() => onPress(src)} accessibilityLabel={`${alt || '이미지'} 크게 보기`}>
          {img}
        </Press>
      ) : (
        img
      )}
    </View>
  );
}

const base = (m: M) => ({ fontSize: m.font, lineHeight: m.line, color: m.color });

const s = StyleSheet.create({
  quote: {
    paddingHorizontal: space.x4,
    paddingVertical: space.x3,
    borderRadius: radius.r3,
    backgroundColor: color.bg.neutralWeak,
  },
  hr: { height: 1, backgroundColor: color.stroke.neutralSubtle },
  code: {
    paddingHorizontal: space.x4,
    paddingVertical: space.x3,
    borderRadius: radius.r3,
    backgroundColor: color.bg.neutralWeak,
  },
  table: {
    borderWidth: 1,
    borderColor: color.stroke.neutralSubtle,
    borderRadius: radius.r2,
    overflow: 'hidden',
    minWidth: '100%',
  },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: color.stroke.neutralSubtle },
  td: { minWidth: 96, paddingHorizontal: space.x3, paddingVertical: space.x2 },
});
