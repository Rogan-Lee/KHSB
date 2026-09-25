import { useState } from 'react';
import { View } from 'react-native';

import { BottomSheet, Button, TextField, toast } from '@/design';
import { rejectSchedule } from '@/lib/api/parent-services';

/** 등원 스케줄 수정 요청 — 승인 전이면 반려, 반영 뒤면 의견만 전달 */
export function ScheduleFeedbackSheet({
  open,
  proposalId,
  beforeApproval,
  onClose,
  onSent,
}: {
  open: boolean;
  proposalId: string;
  /** 승인 전(PROPOSED) 인지 — 안내 문구만 다름 */
  beforeApproval: boolean;
  onClose: () => void;
  onSent: () => void;
}) {
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (busy) return;
    if (!content.trim()) {
      toast('수정이 필요한 부분을 알려 주세요', 'error');
      return;
    }
    setBusy(true);
    try {
      await rejectSchedule(proposalId, content.trim());
      toast('의견을 전달했어요', 'success');
      setContent('');
      onSent();
    } catch (e) {
      toast(e instanceof Error ? e.message : '전달하지 못했어요', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={() => !busy && onClose()}
      title="수정 요청"
      description={
        beforeApproval
          ? '바꾸고 싶은 요일·시간을 알려 주시면 운영진이 확인하고 다시 안내드려요.'
          : '이미 적용된 스케줄이에요. 바꾸고 싶은 부분을 남겨 주시면 운영진이 확인해요.'
      }
      footer={
        <>
          <View style={{ flex: 1 }}>
            <Button variant="gray" size="xl" block disabled={busy} onPress={onClose}>
              닫기
            </Button>
          </View>
          <View style={{ flex: 1 }}>
            <Button variant="primary" size="xl" block loading={busy} disabled={!content.trim()} onPress={send}>
              의견 보내기
            </Button>
          </View>
        </>
      }>
      <TextField
        value={content}
        onChangeText={setContent}
        placeholder="예: 수요일은 학원 때문에 19시에 등원해요."
        accessibilityLabel="수정 요청 내용"
        multiline
        minHeight={120}
        maxLength={1000}
        showCount
        autoFocus
      />
    </BottomSheet>
  );
}
