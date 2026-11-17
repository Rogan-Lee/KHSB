import { Send } from 'lucide-react-native';
import { Fragment, useState } from 'react';
import { View } from 'react-native';

import { Button, Divider, Skeleton, Stack, Text, space, toast } from '@/design';
import { errorText } from '@/features/staff-inbox/ui';
import {
  sendInstruction,
  staffStudentInstructionsPath,
  type StaffStudentInstructionsResponse,
} from '@/lib/api/instructions';
import { useMobileQuery } from '@/lib/mobile-api';

import { InstructionField, InstructionItem } from './ui';

/**
 * 학생 한 명의 보낸 지시 — 학생 프로필(compose: 바로 지시 쓰기)과 멘토링 상세(읽기 전용)가 같이 쓴다.
 * 감싸는 카드·제목은 쓰는 쪽이 정한다.
 */
export function StudentInstructions({
  studentId,
  compose = false,
  limit = 5,
}: {
  studentId: string;
  compose?: boolean;
  limit?: number;
}) {
  const { data, error, isLoading, refresh, retry } = useMobileQuery<StaffStudentInstructionsResponse>(
    staffStudentInstructionsPath(studentId),
  );
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const items = data?.items ?? [];
  const visible = showAll ? items : items.slice(0, limit);
  const content = text.trim();

  async function send() {
    if (!content || sending) return;
    setSending(true);
    try {
      await sendInstruction({ studentId, content });
      toast('학생에게 보냈어요', 'success');
      setText('');
      void refresh();
    } catch (e) {
      toast(errorText(e), 'error');
    } finally {
      setSending(false);
    }
  }

  return (
    <Stack gap={space.x4}>
      {compose ? (
        <>
          <InstructionField
            value={text}
            onChangeText={setText}
            editable={!sending}
            placeholder="학생에게 바로 전할 지시를 적어 주세요"
          />
          <Button
            variant="primary"
            size="md"
            block
            icon={Send}
            loading={sending}
            disabled={!content}
            onPress={() => void send()}>
            학생에게 보내기
          </Button>
          <Text variant="t4-bold" color="neutralMuted" style={{ marginTop: space.x2 }}>
            보낸 지시
          </Text>
        </>
      ) : null}

      {isLoading && !data ? (
        <View style={{ gap: space.x2 }}>
          <Skeleton style={{ width: '40%', height: 18 }} />
          <Skeleton style={{ width: '90%', height: 16 }} />
        </View>
      ) : error && !data ? (
        <View style={{ gap: space.x2, alignItems: 'flex-start' }}>
          <Text variant="t4-regular" color="neutralSubtle">
            {error}
          </Text>
          <Button variant="weak" size="sm" onPress={() => void retry()}>
            다시 불러오기
          </Button>
        </View>
      ) : items.length === 0 ? (
        <Text variant="t4-regular" color="neutralSubtle">
          아직 보낸 지시가 없어요.
        </Text>
      ) : (
        <>
          {visible.map((it, i) => (
            <Fragment key={it.id}>
              {i > 0 ? <Divider /> : null}
              <InstructionItem item={it} />
            </Fragment>
          ))}
          {items.length > visible.length ? (
            <Button variant="ghost" size="sm" block onPress={() => setShowAll(true)}>
              {`${items.length - visible.length}건 더 보기`}
            </Button>
          ) : null}
        </>
      )}
    </Stack>
  );
}
