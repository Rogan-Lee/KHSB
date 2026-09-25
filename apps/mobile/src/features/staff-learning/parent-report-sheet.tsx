import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';

import { BottomSheet, Button, TextField, toast } from '@/design';
import { createParentReport, type ParentReportCreateResult } from '@/lib/api/staff-learning';

import { shareMessage } from './share';

/**
 * 학부모 리포트 링크 만들기 → 공유 시트. 유효한 리포트가 이미 있으면(메모 없을 때) 서버가 재사용한다.
 * busy 중 중복 호출은 무시.
 */
export function useSendParentReport(onSent?: (r: ParentReportCreateResult) => void) {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  const send = useCallback(
    async (params: { mentoringId?: string; studentId?: string; customNote?: string | null; studentName?: string }) => {
      if (lock.current) return null;
      lock.current = true;
      setBusy(true);
      try {
        const result = await createParentReport({
          mentoringId: params.mentoringId,
          studentId: params.studentId,
          customNote: params.customNote?.trim() || null,
        });
        const outcome = await shareMessage(
          result.shareText,
          `${params.studentName ?? result.studentName} 학부모 리포트`,
        );
        if (outcome === 'shared') toast('리포트를 보냈어요', 'success');
        else if (outcome === 'dismissed')
          toast(result.reused ? '리포트는 그대로 있어요. 언제든 다시 보낼 수 있어요' : '리포트 링크를 만들었어요');
        onSent?.(result);
        return result;
      } catch (error) {
        toast(error instanceof Error ? error.message : '리포트를 만들지 못했어요', 'error');
        return null;
      } finally {
        lock.current = false;
        setBusy(false);
      }
    },
    [onSent],
  );

  return { send, busy };
}

/** 기록 저장 직후·발송 현황에서 여는 "학부모님께 리포트를 보낼까요?" 시트 */
export function ParentReportSheet({
  open,
  onClose,
  mentoringId,
  studentName,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  mentoringId: string;
  studentName: string;
  onSent?: (r: ParentReportCreateResult) => void;
}) {
  const [note, setNote] = useState('');
  const { send, busy } = useSendParentReport(onSent);

  const submit = async () => {
    const result = await send({ mentoringId, customNote: note, studentName });
    if (result) {
      setNote('');
      onClose();
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={() => !busy && onClose()}
      dismissible={!busy}
      title={`${studentName} 학부모님께 리포트를 보낼까요?`}
      description="멘토링 기록을 정리한 리포트 링크를 만들어 카카오톡·문자로 보낼 수 있어요. 링크는 30일 동안 열려요."
      footer={
        <>
          <View style={{ flex: 1 }}>
            <Button variant="gray" size="lg" block disabled={busy} onPress={onClose}>
              나중에
            </Button>
          </View>
          <View style={{ flex: 1 }}>
            <Button variant="primary" size="lg" block loading={busy} onPress={() => void submit()}>
              보내기
            </Button>
          </View>
        </>
      }>
      <TextField
        label="학부모님께 한마디"
        indicator="선택"
        value={note}
        onChangeText={setNote}
        placeholder="비워 두면 기타 메모가 들어가요"
        multiline
        minHeight={96}
        maxLength={1000}
        showCount
      />
    </BottomSheet>
  );
}
