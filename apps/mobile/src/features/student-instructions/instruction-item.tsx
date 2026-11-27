import { CircleCheck } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, color, space, Text, toast } from '@/design';
import { AiMadeNote } from '@/features/parent/report-parts';
import { formatBubbleTime } from '@/features/student-comm/format';
import { ackInstruction, type StudentInstruction } from '@/lib/api/instructions';

// 선생님 지시 한 건 — 지시 화면 카드와 홈 "선생님 지시" 섹션이 같이 쓴다.
// 서버 응답에는 학부모 요청 여부가 없다 — 학생에게는 보낸 선생님 이름만 보여 준다.

/** "김조교 선생님 · 오후 2:10" (오늘이 아니면 "3월 5일 오후 2:10") */
export function senderLabel(item: StudentInstruction) {
  const who = item.sentByName ? `${item.sentByName} 선생님` : '선생님';
  return item.sentAt ? `${who} · ${formatBubbleTime(item.sentAt)}` : who;
}

/** 내용 · 보낸 사람 · [확인했어요] 또는 "확인함 · 시각". 확인 성공 뒤 onAcked 로 목록을 다시 불러온다 */
export function InstructionItem({ item, onAcked }: { item: StudentInstruction; onAcked: () => void }) {
  const [pending, setPending] = useState(false);
  // 다시 불러오기 전까지 버튼이 되살아나지 않도록 성공 시각을 들고 있는다
  const [localAckedAt, setLocalAckedAt] = useState<string | null>(null);
  const ackedAt = item.ackedAt ?? localAckedAt;

  const ack = async () => {
    if (pending) return;
    setPending(true);
    try {
      await ackInstruction(item.id);
      setLocalAckedAt(new Date().toISOString());
      toast('확인했어요', 'success');
      onAcked();
    } catch (e) {
      toast(e instanceof Error ? e.message : '확인 처리를 하지 못했어요', 'error');
    } finally {
      setPending(false);
    }
  };

  return (
    <View style={s.item}>
      <Text variant="t5-medium">{item.content}</Text>
      <Text variant="t3-regular" color="neutralSubtle" tabular>
        {senderLabel(item)}
      </Text>
      {item.aiGenerated && <AiMadeNote />}
      {ackedAt ? (
        <View style={s.acked}>
          <CircleCheck color={color.fg.positive} size={16} strokeWidth={2.2} />
          <Text variant="t3-medium" color="positive" tabular>
            확인함 · {formatBubbleTime(ackedAt)}
          </Text>
        </View>
      ) : (
        <Button variant="weak" size="md" block loading={pending} onPress={() => void ack()} style={s.button}>
          확인했어요
        </Button>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  item: { gap: space.x1_5 },
  acked: { flexDirection: 'row', alignItems: 'center', gap: space.x1, marginTop: space.x1_5 },
  button: { marginTop: space.x2 },
});
