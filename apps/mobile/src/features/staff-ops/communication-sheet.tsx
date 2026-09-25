import { useState } from 'react';
import { View } from 'react-native';

import { BottomSheet, Button, Segmented, space, TextField, toast } from '@/design';
import { createCommunication, type CommunicationType } from '@/lib/api/staff-ops';

import { FooterSlot, useSheetSession } from './attendance-controls';

/** 학부모 요청 · 운영진 전달사항 등록 */
export function CommunicationSheet({
  student,
  open,
  onClose,
  onSaved,
}: {
  student: { id: string; name: string } | null;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [type, setType] = useState<CommunicationType>('PARENT_REQUEST');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  useSheetSession(open, student?.id ?? null, () => {
    setType('PARENT_REQUEST');
    setContent('');
  });

  const submit = async () => {
    if (saving || !student) return;
    if (!content.trim()) {
      toast('내용을 입력해 주세요', 'error');
      return;
    }
    setSaving(true);
    try {
      await createCommunication(student.id, { type, content: content.trim() });
      toast(type === 'PARENT_REQUEST' ? '학부모 요청을 남겼어요' : '전달사항을 남겼어요', 'success');
      onSaved?.();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : '저장하지 못했어요', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      open={open && !!student}
      onClose={onClose}
      title="요청·전달사항 남기기"
      description={student ? `${student.name} · 운영진 모두에게 보여요` : undefined}
      footer={
        <>
          <FooterSlot>
            <Button variant="gray" block onPress={onClose} disabled={saving}>
              취소
            </Button>
          </FooterSlot>
          <FooterSlot>
            <Button block loading={saving} disabled={!content.trim()} onPress={() => void submit()}>
              남기기
            </Button>
          </FooterSlot>
        </>
      }>
      <Segmented
        options={[
          { value: 'PARENT_REQUEST' as const, label: '학부모 요청' },
          { value: 'STAFF_NOTE' as const, label: '운영진 전달' },
        ]}
        value={type}
        onChange={setType}
      />
      <View style={{ paddingTop: space.x1 }}>
        <TextField
          value={content}
          onChangeText={setContent}
          multiline
          minHeight={120}
          maxLength={1000}
          showCount
          placeholder={
            type === 'PARENT_REQUEST'
              ? '예: 오늘 18시에 병원 때문에 일찍 데려가신대요'
              : '예: 수요일부터 자리 이동 원함 — 다음 근무자 확인 부탁해요'
          }
          accessibilityLabel="내용"
        />
      </View>
    </BottomSheet>
  );
}
