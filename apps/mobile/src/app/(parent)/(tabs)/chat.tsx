import { MessagesSquare } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { EmptyState, Screen, space } from '@/design';
import { FamilyChatThread } from '@/features/family-chat/thread';
import { ChildChips, useParentChild } from '@/lib/parent-child';

/** 학부모 톡방 탭 — 선택된 자녀의 가족 톡방 (자녀가 여럿이면 위 칩으로 고른다) */
export default function ParentFamilyChatTab() {
  const { selected, hasMultiple } = useParentChild();

  if (!selected) {
    return (
      <Screen kind="tab" title="톡방">
        <EmptyState
          icon={MessagesSquare}
          title="연결된 자녀가 없어요"
          description="자녀를 연결하면 가족 톡방에서 운영진과 이야기할 수 있어요."
        />
      </Screen>
    );
  }

  return (
    <Screen kind="tab" title="톡방" scroll={false} maxWidth={0}>
      {hasMultiple ? (
        <View style={s.chips}>
          <ChildChips />
        </View>
      ) : null}
      <FamilyChatThread audience="parent" studentId={selected.id} />
    </Screen>
  );
}

const s = StyleSheet.create({
  chips: { paddingHorizontal: space.x4, paddingBottom: space.x2 },
});
