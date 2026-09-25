import { Send } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Chip, ChipGroup, Section, space, Text, TextField, toast } from '@/design';
import { INQUIRY_KIND_OPTIONS, sendInquiry, type InquiryKind } from '@/lib/api/parent-services';

const PLACEHOLDER: Record<InquiryKind, string> = {
  CONSULT: '상담 받고 싶은 내용과 편한 요일·시간대를 알려 주세요.',
  ATTENDANCE: '예: 내일은 병원 진료로 오후 3시에 등원해요.',
  STUDY: '예: 요즘 수학 공부 방법이 궁금해요.',
  ETC: '궁금한 점이나 전하고 싶은 말을 남겨 주세요.',
};

const MIN_LENGTH = 5;
const MAX_LENGTH = 1000;

/** 원장님께 문의 작성 — 종류 칩 + 내용 + 보내기 */
export function InquiryCompose({
  studentId,
  studentName,
  onSent,
}: {
  studentId: string;
  studentName: string;
  onSent: () => void;
}) {
  const [kind, setKind] = useState<InquiryKind>('CONSULT');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const ready = content.trim().length >= MIN_LENGTH;

  const send = async () => {
    if (busy) return;
    if (!ready) {
      toast(`문의 내용을 ${MIN_LENGTH}자 이상 적어 주세요`, 'error');
      return;
    }
    setBusy(true);
    try {
      await sendInquiry(studentId, kind, content.trim());
      toast('문의를 보냈어요. 확인 후 연락드릴게요', 'success');
      setContent('');
      onSent();
    } catch (e) {
      toast(e instanceof Error ? e.message : '보내지 못했어요', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="무엇을 도와드릴까요?"
      description={`${studentName} 학생에 대한 문의를 남기면 원장님과 운영진이 확인하고 연락드려요.`}>
      <View style={{ gap: space.x4 }}>
        <View style={{ gap: space.x2 }}>
          <Text variant="t5-medium">문의 종류</Text>
          <ChipGroup>
            {INQUIRY_KIND_OPTIONS.map((o) => (
              <Chip key={o.value} size="lg" selected={kind === o.value} onPress={() => setKind(o.value)}>
                {o.label}
              </Chip>
            ))}
          </ChipGroup>
        </View>
        <TextField
          label="내용"
          value={content}
          onChangeText={setContent}
          placeholder={PLACEHOLDER[kind]}
          multiline
          minHeight={132}
          maxLength={MAX_LENGTH}
          showCount
        />
        <Button variant="primary" size="lg" block icon={Send} loading={busy} disabled={!ready} onPress={send}>
          문의 보내기
        </Button>
      </View>
    </Section>
  );
}
