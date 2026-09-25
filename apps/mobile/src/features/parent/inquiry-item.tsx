import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge, Press, radius, space, Text } from '@/design';
import type { ParentInquiry } from '@/lib/api/parent-services';

import { kstDateTimeLabel, kstRelativeLabel } from './notice-format';

/** 보낸 문의 한 건 — 종류 · 확인 상태 · 내용(길면 눌러서 펼치기) · 보낸 시각 */
export function InquiryItem({ item }: { item: ParentInquiry }) {
  const [open, setOpen] = useState(false);
  const long = item.content.length > 90 || item.content.split('\n').length > 3;

  return (
    <Press
      onPress={long ? () => setOpen((v) => !v) : undefined}
      disabled={!long}
      scale={0}
      pressedBg={long}
      accessibilityRole={long ? 'button' : 'text'}
      accessibilityLabel={`${item.kindLabel} 문의, ${item.checked ? '확인됨' : '확인 대기'}, ${item.content}`}
      accessibilityHint={long ? (open ? '눌러서 접기' : '눌러서 전체 보기') : undefined}
      style={s.item}>
      <View style={s.meta}>
        <Badge tone="gray">{item.kindLabel}</Badge>
        {item.checked ? <Badge tone="ok">확인됨</Badge> : <Badge tone="warn">확인 대기</Badge>}
        <Text variant="t3-regular" color="neutralSubtle" tabular style={{ marginLeft: 'auto' }}>
          {kstRelativeLabel(item.createdAt)}
        </Text>
      </View>
      <Text variant="t5-regular" numberOfLines={open ? undefined : 3}>
        {item.content}
      </Text>
      {long && (
        <Text variant="t4-medium" color="neutralSubtle">
          {open ? '접기' : '더 보기'}
        </Text>
      )}
      {item.checked && item.checkedAt && (
        <Text variant="t3-regular" color="neutralSubtle" tabular>
          {kstDateTimeLabel(item.checkedAt)}에 확인했어요
        </Text>
      )}
    </Press>
  );
}

const s = StyleSheet.create({
  item: {
    marginHorizontal: space.x2,
    paddingHorizontal: space.x3,
    paddingVertical: space.x3_5,
    borderRadius: radius.r4,
    gap: space.x2,
  },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.x1_5, flexWrap: 'wrap' },
});
