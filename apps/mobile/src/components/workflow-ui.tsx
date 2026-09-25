import { CircleAlert } from 'lucide-react-native';
import { StyleSheet, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { Avatar, Notice, Text, TextField, color, radius, space } from '@/design';
import { formatBubbleTime } from '@/features/student-comm/format';
import { BubbleAttachments } from '@/features/student-comm/message-parts';
import type { QuestionThreadResponse } from '@/lib/mobile-api';

/**
 * @deprecated 새 화면은 `TextField`(@/design) 를 직접 쓴다. 기존 화면 호환용 — SEED TextField 로 그린다.
 */
export function FormInput({
  label,
  multiline,
  maxLength,
  style: _style,
  ...props
}: TextInputProps & { label: string }) {
  return (
    <TextField
      {...props}
      label={label}
      multiline={multiline}
      maxLength={maxLength}
      showCount={!!multiline && maxLength != null}
    />
  );
}

/** 폼 에러 안내 (SEED Callout critical). 빈 문자열이면 아무것도 그리지 않는다. */
export function FormError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <Notice tone="bad" icon={CircleAlert}>
      {message}
    </Notice>
  );
}

type ThreadMessage = QuestionThreadResponse['messages'][number];

/**
 * 질문 스레드 말풍선 목록 — 웹 QuestionThread(portal) 와 같은 SEED 모양.
 *  · 내 메시지: 브랜드색 오른쪽, 아래 시각
 *  · 상대: 아바타 + 이름(멘토면 "○○ 멘토") + 말풍선, 아래 시각
 *  · 사진(1장 크게 / 여러 장 2열, 누르면 크게 보기)·영상·파일
 * surface: 회색 캔버스 위(canvas)면 상대 말풍선이 흰색, 흰 패널 위(panel, 기본)면 회색.
 */
export function MessageThread({
  messages,
  viewer,
  surface = 'panel',
  emptyHint,
  style,
}: {
  messages: ThreadMessage[];
  viewer: 'STUDENT' | 'STAFF';
  surface?: 'canvas' | 'panel';
  /** 메시지가 없을 때 안내 */
  emptyHint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const onCanvas = surface === 'canvas';
  if (messages.length === 0) {
    return emptyHint ? (
      <Text variant="t4-regular" color="neutralSubtle" align="center" style={s.empty}>
        {emptyHint}
      </Text>
    ) : null;
  }
  return (
    <View style={[s.list, style]} accessibilityRole="list">
      {messages.map((m) => {
        const mine = m.senderType === viewer;
        const hasBody = m.content.length > 0;
        const time = (
          <Text variant="t2-regular" color="placeholder" tabular style={s.time}>
            {formatBubbleTime(m.createdAt)}
          </Text>
        );
        if (mine) {
          return (
            <View key={m.id} style={s.mineRow}>
              <View style={s.mineCol}>
                <BubbleAttachments attachments={m.attachments} mine onCanvas={onCanvas} />
                {hasBody && (
                  <View style={[s.bubble, s.bubbleMine]}>
                    <Text variant="t5-regular" color="staticWhite" selectable>
                      {m.content}
                    </Text>
                  </View>
                )}
              </View>
              {time}
            </View>
          );
        }
        const name =
          m.senderType === 'STAFF' && m.senderName && !m.senderName.endsWith('멘토')
            ? `${m.senderName} 멘토`
            : m.senderName || '멘토';
        return (
          <View key={m.id} style={s.theirsRow}>
            <Avatar name={m.senderName || '?'} size={32} />
            <View style={s.theirsCol}>
              <Text variant="t3-medium" color="neutralMuted" style={s.name} numberOfLines={1}>
                {name}
              </Text>
              <View style={s.theirsBody}>
                <BubbleAttachments attachments={m.attachments} mine={false} onCanvas={onCanvas} />
                {hasBody && (
                  <View
                    style={[
                      s.bubble,
                      s.bubbleTheirs,
                      { backgroundColor: onCanvas ? color.bg.layerDefault : color.bg.neutralWeak },
                    ]}>
                    <Text variant="t5-regular" selectable>
                      {m.content}
                    </Text>
                  </View>
                )}
              </View>
              {time}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  list: { gap: space.x4 },
  empty: { paddingVertical: space.x10 },
  mineRow: { alignItems: 'flex-end' },
  mineCol: { maxWidth: '82%', alignItems: 'flex-end', gap: space.x1_5 },
  theirsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.x2 },
  theirsCol: { maxWidth: '80%', flexShrink: 1, alignItems: 'flex-start' },
  theirsBody: { maxWidth: '100%', alignItems: 'flex-start', gap: space.x1_5 },
  name: { marginBottom: space.x1, paddingHorizontal: space.x1 },
  time: { marginTop: space.x1, paddingHorizontal: space.x1 },
  bubble: {
    maxWidth: '100%',
    borderRadius: radius.r5,
    paddingHorizontal: space.x4,
    paddingVertical: space.x2_5,
  },
  bubbleMine: { backgroundColor: color.bg.brandSolid, borderBottomRightRadius: radius.r1_5 },
  bubbleTheirs: { borderTopLeftRadius: radius.r1_5 },
});
