import { CircleCheck, Clock, MessageCircleQuestionMark, UserCheck } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';

import {
  Avatar,
  Badge,
  Button,
  Chip,
  ChipGroup,
  EmptyState,
  ErrorState,
  Notice,
  Section,
  type Tone,
} from '@/design';
import {
  staffInboxPaths,
  type StaffQuestionFilter,
  type StaffQuestionInboxResponse,
  type StaffQuestionItem,
} from '@/lib/api/staff-inbox';
import { useMobileQuery } from '@/lib/mobile-api';

import { QUESTION_STATUS } from './status';
import { formatInboxTime } from './time';
import { InboxListSkeleton, InboxRow, PaneScroll } from './ui';

const PAGE = 40;

/** 추가 질문(답변 후 학생이 다시 물어봄)은 상태가 ANSWERED 여도 대기로 보여 준다 */
export function questionStatusMeta(q: Pick<StaffQuestionItem, 'status' | 'waiting'>): {
  label: string;
  tone: Tone;
} {
  if (q.waiting && q.status === 'ANSWERED') return { label: '추가 질문', tone: 'warn' };
  return QUESTION_STATUS[q.status];
}

const EMPTY: Record<StaffQuestionFilter, { icon: typeof CircleCheck; tone: Tone; title: string; description: string }> = {
  waiting: {
    icon: CircleCheck,
    tone: 'ok',
    title: '답변을 기다리는 질문이 없어요',
    description: '새 질문이 들어오면 여기에 먼저 보여요.',
  },
  mine: {
    icon: UserCheck,
    tone: 'gray',
    title: '내가 담당한 질문이 없어요',
    description: '질문을 열고 ‘담당하기’를 누르면 여기에 모여요.',
  },
  all: {
    icon: MessageCircleQuestionMark,
    tone: 'gray',
    title: '아직 들어온 질문이 없어요',
    description: '학생이 질문을 올리면 여기에 보여요.',
  },
};

export function QuestionsPanel({
  selectedId,
  onOpen,
  refreshKey,
}: {
  selectedId: string | null;
  onOpen: (id: string) => void;
  /** 바뀌면 조용히 다시 불러온다 (태블릿 상세에서 처리한 뒤) */
  refreshKey: number;
}) {
  const { data, error, isLoading, isRefreshing, refresh, retry } =
    useMobileQuery<StaffQuestionInboxResponse>(staffInboxPaths.questions);
  const [filter, setFilter] = useState<StaffQuestionFilter>('waiting');
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    if (refreshKey > 0) void refresh();
  }, [refreshKey, refresh]);

  const items = useMemo(() => data?.items ?? [], [data]);
  const counts = useMemo(
    () => ({
      waiting: items.filter((q) => q.waiting).length,
      mine: items.filter((q) => q.claimedByMe).length,
      overdue: items.filter((q) => q.overdue).length,
    }),
    [items],
  );
  const visible = items.filter((q) =>
    filter === 'waiting' ? q.waiting : filter === 'mine' ? q.claimedByMe : true,
  );

  const changeFilter = (next: StaffQuestionFilter) => {
    setFilter(next);
    setLimit(PAGE);
  };

  const empty = EMPTY[filter];

  return (
    <PaneScroll refreshing={isRefreshing} onRefresh={() => void refresh()}>
      <ChipGroup>
        <Chip selected={filter === 'waiting'} onPress={() => changeFilter('waiting')}>
          {counts.waiting > 0 ? `답변 대기 ${counts.waiting}` : '답변 대기'}
        </Chip>
        <Chip selected={filter === 'mine'} onPress={() => changeFilter('mine')}>
          {counts.mine > 0 ? `내 담당 ${counts.mine}` : '내 담당'}
        </Chip>
        <Chip selected={filter === 'all'} onPress={() => changeFilter('all')}>
          전체
        </Chip>
      </ChipGroup>

      {filter === 'waiting' && counts.overdue > 0 ? (
        <Notice tone="warn" icon={Clock}>
          {`24시간 넘게 답변을 기다린 질문이 ${counts.overdue}개 있어요.`}
        </Notice>
      ) : null}

      {isLoading && !data ? (
        <InboxListSkeleton headline />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={() => void retry()} />
      ) : visible.length === 0 ? (
        <Section>
          <EmptyState icon={empty.icon} tone={empty.tone} title={empty.title} description={empty.description} />
        </Section>
      ) : (
        <Section flush>
          {visible.slice(0, limit).map((q) => (
            <QuestionRow key={q.id} question={q} selected={q.id === selectedId} onPress={() => onOpen(q.id)} />
          ))}
        </Section>
      )}

      {visible.length > limit ? (
        <Button variant="weak" size="md" onPress={() => setLimit((n) => n + PAGE)}>
          {`${visible.length - limit}개 더 보기`}
        </Button>
      ) : null}
    </PaneScroll>
  );
}

function QuestionRow({
  question: q,
  selected,
  onPress,
}: {
  question: StaffQuestionItem;
  selected: boolean;
  onPress: () => void;
}) {
  const status = questionStatusMeta(q);
  const body = q.lastMessage || (q.attachmentCount > 0 ? '사진·파일을 보냈어요' : '');
  const preview = q.lastSenderType === 'STAFF' ? `답변: ${body}` : body;
  return (
    <InboxRow
      leading={<Avatar name={q.studentName} size={40} />}
      title={q.studentName}
      subtitle={q.grade}
      time={formatInboxTime(q.lastMessageAt)}
      headline={q.title}
      preview={preview}
      unread={selected ? 0 : q.unread}
      selected={selected}
      onPress={onPress}
      accessibilityLabel={`${q.studentName} 학생 질문, ${q.title}, ${status.label}${
        q.unread > 0 ? `, 새 메시지 ${q.unread}개` : ''
      }`}
      meta={
        <>
          <Badge tone={status.tone}>{status.label}</Badge>
          {q.subject ? <Badge tone="gray">{q.subject}</Badge> : null}
          {q.overdue ? <Badge tone="bad">24시간 경과</Badge> : null}
          {q.claimedBy ? (
            <Badge tone={q.claimedByMe ? 'violet' : 'gray'}>
              {q.claimedByMe ? '내 담당' : `${q.claimedBy.name} 담당`}
            </Badge>
          ) : null}
          {q.attachmentCount > 0 ? <Badge tone="gray">{`첨부 ${q.attachmentCount}`}</Badge> : null}
        </>
      }
    />
  );
}
