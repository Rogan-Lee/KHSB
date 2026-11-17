import type { Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { color, Section, SectionAction, space } from '@/design';
import type { StudentInstructionsResponse } from '@/lib/api/instructions';

import { InstructionItem } from './instruction-item';

// 새 화면 — typed routes 생성 전에도 컴파일되도록 Href 로 고정
export const INSTRUCTIONS_ROUTE = '/(student)/instructions' as Href;

/** 학생 홈 "선생님 지시" — 확인 안 한 지시 중 최신 2건. 없거나 불러오지 못하면 그리지 않는다 */
export function InstructionsHomeSection({
  data,
  onAcked,
}: {
  data: StudentInstructionsResponse | null;
  onAcked: () => void;
}) {
  const unacked = data?.items.filter((it) => !it.ackedAt).slice(0, 2) ?? [];
  if (unacked.length === 0) return null;

  return (
    <Section title="선생님 지시" action={<SectionAction href={INSTRUCTIONS_ROUTE}>전체</SectionAction>}>
      {unacked.map((it, i) => (
        <View key={it.id} style={i > 0 && s.divided}>
          <InstructionItem item={it} onAcked={onAcked} />
        </View>
      ))}
    </Section>
  );
}

const s = StyleSheet.create({
  divided: {
    marginTop: space.x4,
    paddingTop: space.x4,
    borderTopWidth: 1,
    borderTopColor: color.stroke.neutralSubtle,
  },
});
