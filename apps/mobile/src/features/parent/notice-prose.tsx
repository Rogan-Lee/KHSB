import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { color, Press, space, Text, type TextVariant } from '@/design';

// 공지·입시 정보·도시락 입금 안내처럼 운영진이 쓴 마크다운 섞인 글을 읽기 좋게.
// 새 패키지 없이: 문단(빈 줄) · 제목(#) · 목록(- * • / 1.) · 구분선(---) · **굵게**.
// 40–50대 학부모가 읽기 편하게 본문 16px(t5) · 줄 간격 넉넉히.

type Block =
  | { type: 'p'; text: string }
  | { type: 'h'; text: string; level: number }
  | { type: 'li'; text: string; marker: string }
  | { type: 'hr' };

export function toProseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: 'p', text: para.join('\n') });
    para = [];
  };
  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const t = line.trim();
    if (!t) {
      flush();
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      flush();
      blocks.push({ type: 'hr' });
      continue;
    }
    const heading = t.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flush();
      blocks.push({ type: 'h', text: heading[2], level: heading[1].length });
      continue;
    }
    const bullet = t.match(/^[-*•·]\s+(.+)$/);
    if (bullet) {
      flush();
      blocks.push({ type: 'li', text: bullet[1], marker: '•' });
      continue;
    }
    const numbered = t.match(/^(\d{1,2})[.)]\s+(.+)$/);
    if (numbered) {
      flush();
      blocks.push({ type: 'li', text: numbered[2], marker: `${numbered[1]}.` });
      continue;
    }
    para.push(t);
  }
  flush();
  return blocks;
}

/** **굵게** · `코드` 표시만 정리 (링크 [글](주소) 는 글자만) */
function inline(text: string, boldColor: string): ReactNode[] {
  const cleaned = text.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1 ($2)').replace(/`([^`]+)`/g, '$1');
  return cleaned.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <Text key={i} variant="t5-bold" style={{ color: boldColor }}>
        {part.slice(2, -2)}
      </Text>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

const BODY: TextVariant = 't5-regular';
const LINE = 26;

export function NoticeProse({
  text,
  collapsedBlocks,
  tone = 'neutral',
}: {
  text: string;
  /** 지정하면 이 블록 수까지만 보여 주고 "더 보기" */
  collapsedBlocks?: number;
  tone?: 'neutral' | 'muted';
}) {
  const blocks = useMemo(() => toProseBlocks(text), [text]);
  const [open, setOpen] = useState(false);
  const canCollapse = collapsedBlocks != null && blocks.length > collapsedBlocks;
  const shown = canCollapse && !open ? blocks.slice(0, collapsedBlocks) : blocks;
  const fg = tone === 'muted' ? color.fg.neutralMuted : color.fg.neutral;

  return (
    <View style={{ gap: space.x2_5 }}>
      {shown.map((b, i) => {
        if (b.type === 'hr') return <View key={i} style={s.hr} />;
        if (b.type === 'h') {
          return (
            <Text
              key={i}
              variant={b.level <= 2 ? 't6-bold' : 't5-bold'}
              accessibilityRole="header"
              style={i > 0 ? { marginTop: space.x2 } : undefined}>
              {b.text}
            </Text>
          );
        }
        if (b.type === 'li') {
          return (
            <View key={i} style={s.li}>
              <Text variant={BODY} style={[s.marker, { color: fg, lineHeight: LINE }]} tabular>
                {b.marker}
              </Text>
              <Text variant={BODY} selectable style={{ flex: 1, color: fg, lineHeight: LINE }}>
                {inline(b.text, color.fg.neutral)}
              </Text>
            </View>
          );
        }
        return (
          <Text key={i} variant={BODY} selectable style={{ color: fg, lineHeight: LINE }}>
            {inline(b.text, color.fg.neutral)}
          </Text>
        );
      })}
      {canCollapse && (
        <Press
          onPress={() => setOpen((v) => !v)}
          scale={0}
          pressedBg
          hitSlop={6}
          accessibilityLabel={open ? '접기' : '더 보기'}
          style={s.more}>
          <Text variant="t4-medium" color="neutralSubtle">
            {open ? '접기' : '더 보기'}
          </Text>
          {open ? (
            <ChevronUp color={color.fg.neutralSubtle} size={16} strokeWidth={2.2} />
          ) : (
            <ChevronDown color={color.fg.neutralSubtle} size={16} strokeWidth={2.2} />
          )}
        </Press>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  li: { flexDirection: 'row', gap: space.x2, paddingLeft: space.x1 },
  marker: { minWidth: 14 },
  hr: { height: 1, backgroundColor: color.stroke.neutralSubtle, marginVertical: space.x1 },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.x0_5,
    minHeight: 36,
    paddingHorizontal: space.x1,
    marginLeft: -space.x1,
    borderRadius: 8,
  },
});
