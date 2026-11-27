import { CircleCheck, FileText } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import {
  Button,
  EmptyState,
  Markdown,
  Section,
  showImages,
  space,
  Stack,
  TextField,
  toast,
} from '@/design';
import { submitOnlineReportFeedback, type ParentOnlineReport } from '@/lib/api/parent-reports';

import { monthDayOfIso, monthDayOfKey } from './report-format';
import { ReportHero } from './report-parts';

// 온라인 관리 보고서 — 웹 /r/online/[token] (SEED) 과 같은 구성: 머리글 → 본문(마크다운) → 원장님께 의견 남기기.

const MAX_LENGTH = 2000;

export function OnlineReportBody({ data }: { data: ParentOnlineReport }) {
  return (
    <Stack>
      <ReportHero
        eyebrow={`학부모 ${data.typeLabel} 보고서`}
        title={`${data.student.name} 학생`}
        meta={[
          data.student.grade,
          `${monthDayOfKey(data.periodStart)} ~ ${monthDayOfKey(data.periodEnd)}`,
          data.sentAt ? `발송 ${monthDayOfIso(data.sentAt)}` : null,
        ]}
      />

      <Section>
        {data.markdown.trim() ? (
          <Markdown source={data.markdown} onImagePress={(src) => showImages([src])} />
        ) : (
          <EmptyState icon={FileText} title="아직 작성된 내용이 없어요" style={{ paddingVertical: space.x8 }} />
        )}
      </Section>

      {data.feedbackEnabled && <FeedbackForm reportId={data.id} />}
    </Stack>
  );
}

/** 원장님께 의견 남기기 — 보낸 사람 이름은 서버가 학부모 계정으로 채운다 (웹의 "성함" 칸 없음) */
function FeedbackForm({ reportId }: { reportId: string }) {
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const busy = useRef(false);

  const submit = async () => {
    if (busy.current) return;
    const text = content.trim();
    if (!text) {
      toast('내용을 입력해 주세요', 'error');
      return;
    }
    busy.current = true;
    setSending(true);
    try {
      await submitOnlineReportFeedback(reportId, text);
      setContent('');
      setSent(true);
      toast('의견을 전달했어요', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : '보내지 못했어요. 다시 시도해 주세요', 'error');
    } finally {
      busy.current = false;
      setSending(false);
    }
  };

  if (sent) {
    return (
      <Section>
        <EmptyState
          icon={CircleCheck}
          tone="ok"
          title="의견을 전달했어요"
          description={'원장님이 확인하고 따로 답변드릴게요.\n더 남기실 말씀이 있으면 한 번 더 적어 주세요.'}
          action={
            <Button variant="weak" size="md" onPress={() => setSent(false)}>
              한 번 더 작성하기
            </Button>
          }
          style={{ paddingVertical: space.x6, paddingHorizontal: space.x2 }}
        />
      </Section>
    );
  }

  return (
    <Section
      title="원장님께 의견 남기기"
      description="원장님이 바로 확인하고 따로 답변드려요. 학생에게는 보이지 않아요.">
      <View style={{ gap: space.x6, paddingTop: space.x2 }}>
        <TextField
          label="질문·의견"
          value={content}
          onChangeText={setContent}
          multiline
          minHeight={132}
          maxLength={MAX_LENGTH}
          showCount
          placeholder="궁금한 점이나 전하고 싶은 말씀을 편하게 적어 주세요"
          accessibilityLabel="원장님께 보낼 질문이나 의견"
        />
        <Button
          variant="primary"
          size="xl"
          block
          loading={sending}
          disabled={!content.trim()}
          onPress={() => void submit()}>
          의견 보내기
        </Button>
      </View>
    </Section>
  );
}
