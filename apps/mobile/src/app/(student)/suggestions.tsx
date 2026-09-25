import { Megaphone, MessageSquareReply, Plus, Trash2 } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Badge,
  BottomSheet,
  Button,
  Chip,
  ChipGroup,
  color,
  EmptyState,
  ErrorState,
  Notice,
  radius,
  Screen,
  Section,
  Skeleton,
  space,
  Stack,
  Text,
  TextField,
  toast,
} from '@/design';
import {
  SUGGESTION_CATEGORIES,
  SUGGESTION_STATUS,
  SUGGESTIONS_PATH,
  type StudentSuggestion,
  type StudentSuggestionsResponse,
} from '@/lib/api/student-suggestions';
import { refreshBadges } from '@/lib/badges';
import { mutateMobileApi, useMobileQuery, type SuggestionCategory } from '@/lib/mobile-api';

// 웹 학생 포털 건의사항(/s/[token]/suggestions)과 같은 구성: 안내 → 건의 카드 → 하단 "건의하기" → 작성 시트.
// 서버 GET 이 조회와 동시에 미확인 업데이트를 읽음 처리한다.

const MAX_TITLE = 120;
const MAX_CONTENT = 2000;

/** 9월 25일 14:30 (KST) */
function fmtDate(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${hh}:${mm}`;
}

export default function StudentSuggestionsScreen() {
  const { data, error, isRefreshing, refresh, retry } =
    useMobileQuery<StudentSuggestionsResponse>(SUGGESTIONS_PATH);
  const [open, setOpen] = useState(false);

  // 조회로 읽음 처리됐으니 배지 갱신
  const unseen = data?.summary.unseen ?? 0;
  useEffect(() => {
    if (unseen > 0) refreshBadges();
  }, [unseen]);

  const items = data?.items ?? [];

  return (
    <>
      <Screen
        kind="push"
        title="건의사항"
        backFallback="/(student)/(tabs)/menu"
        refreshing={isRefreshing}
        onRefresh={() => void refresh()}
        footer={
          data ? (
            <Button variant="primary" size="xl" block icon={Plus} onPress={() => setOpen(true)}>
              건의하기
            </Button>
          ) : undefined
        }>
        {!data ? (
          error ? (
            <ErrorState message={error} onRetry={() => void retry()} />
          ) : (
            <SuggestionsSkeleton />
          )
        ) : items.length === 0 ? (
          <Section>
            <EmptyState
              icon={Megaphone}
              tone="brand"
              title="아직 건의사항이 없어요"
              description={'불편한 점이나 바라는 점을 알려주세요.\n검토 후 결과를 여기서 안내해 드려요.'}
              style={{ paddingVertical: space.x10 }}
            />
          </Section>
        ) : (
          <Stack>
            <Text variant="t4-regular" color="neutralSubtle" style={s.intro}>
              불편한 점이나 바라는 점을 알려주세요. 검토 후 결과를 여기서 안내해 드려요.
            </Text>
            {items.map((item) => (
              <SuggestionCard key={item.id} item={item} />
            ))}
          </Stack>
        )}
      </Screen>

      <SuggestionSheet
        open={open}
        onClose={() => setOpen(false)}
        onCreated={() => {
          setOpen(false);
          void refresh();
          refreshBadges();
        }}
      />
    </>
  );
}

function SuggestionCard({ item }: { item: StudentSuggestion }) {
  const deleted = !!item.deletedAt;
  const st = SUGGESTION_STATUS[item.status];
  return (
    <Section>
      <View style={s.badges}>
        <Badge tone="gray">{item.categoryLabel}</Badge>
        {deleted ? <Badge tone="bad">삭제됨</Badge> : <Badge tone={st.tone}>{st.label}</Badge>}
        {item.hasUnseenUpdate && (
          <View style={s.update} accessibilityLabel="새 업데이트">
            <View style={s.dot} />
            <Text variant="t3-bold" color="brand">
              업데이트
            </Text>
          </View>
        )}
      </View>

      {deleted && (
        <Notice tone="bad" icon={Trash2} style={{ marginTop: space.x3 }}>
          관리자가 이 건의사항을 삭제했어요.
        </Notice>
      )}

      <Text variant="t5-bold" color={deleted ? 'neutralMuted' : 'neutral'} style={{ marginTop: space.x3 }}>
        {item.title}
      </Text>
      <Text
        variant="t4-regular"
        color={deleted ? 'neutralSubtle' : 'neutralMuted'}
        style={{ marginTop: space.x1 }}>
        {item.content}
      </Text>

      {item.staffReply ? (
        <View style={s.reply}>
          <View style={s.replyHead}>
            <MessageSquareReply color={color.fg.brand} size={16} strokeWidth={2.2} />
            <Text variant="t3-bold" color="neutralMuted">
              원장 답변{item.handledByName ? ` · ${item.handledByName}` : ''}
            </Text>
          </View>
          <Text variant="t4-regular" color="neutralMuted" style={{ marginTop: space.x1_5 }}>
            {item.staffReply}
          </Text>
        </View>
      ) : null}

      <Text variant="t3-regular" color="neutralSubtle" tabular style={{ marginTop: space.x3 }}>
        {fmtDate(item.createdAt)}
      </Text>
    </Section>
  );
}

function SuggestionSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [category, setCategory] = useState<SuggestionCategory>('FACILITY');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [pending, setPending] = useState(false);
  const busy = useRef(false);

  const submit = async () => {
    if (busy.current) return;
    if (!title.trim()) return toast('제목을 입력해 주세요', 'error');
    if (!content.trim()) return toast('건의 내용을 입력해 주세요', 'error');
    busy.current = true;
    setPending(true);
    try {
      await mutateMobileApi(SUGGESTIONS_PATH, 'POST', {
        category,
        title: title.trim(),
        content: content.trim(),
      });
      toast('건의사항이 접수되었어요', 'success');
      setCategory('FACILITY');
      setTitle('');
      setContent('');
      onCreated();
    } catch (e) {
      toast(e instanceof Error ? e.message : '건의를 보내지 못했어요', 'error');
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={() => {
        if (!pending) onClose();
      }}
      dismissible={!pending}
      title="어떤 점을 건의할까요?"
      description="원장님이 확인하고 답변을 남겨 드려요."
      footer={
        <Button variant="primary" size="xl" block loading={pending} onPress={() => void submit()} style={{ flex: 1 }}>
          건의 보내기
        </Button>
      }>
      <View style={{ gap: space.x5, paddingBottom: space.x1 }}>
        <View style={{ gap: space.x2 }}>
          <Text variant="t5-medium">분류</Text>
          <ChipGroup>
            {SUGGESTION_CATEGORIES.map((c) => (
              <Chip
                key={c.value}
                selected={category === c.value}
                onPress={() => setCategory(c.value)}
                disabled={pending}>
                {c.label}
              </Chip>
            ))}
          </ChipGroup>
        </View>

        <TextField
          label="제목"
          value={title}
          onChangeText={setTitle}
          placeholder="예: 3층 정수기 온수가 안 나와요"
          maxLength={MAX_TITLE}
          showCount
          editable={!pending}
          returnKeyType="next"
        />

        <TextField
          label="내용"
          value={content}
          onChangeText={setContent}
          placeholder="건의 내용을 자세히 적어 주세요"
          maxLength={MAX_CONTENT}
          showCount
          multiline
          minHeight={140}
          editable={!pending}
        />
      </View>
    </BottomSheet>
  );
}

function SuggestionsSkeleton() {
  return (
    <Stack>
      <Skeleton style={{ width: '85%', height: 16, marginTop: space.x2, marginLeft: space.x1 }} />
      {[0, 1].map((i) => (
        <View key={i} style={s.skeletonCard}>
          <View style={{ flexDirection: 'row', gap: space.x1_5 }}>
            <Skeleton style={{ width: 36, height: 20 }} />
            <Skeleton style={{ width: 44, height: 20 }} />
          </View>
          <Skeleton style={{ width: '60%', height: 20 }} />
          <Skeleton style={{ width: '100%', height: 16 }} />
          <Skeleton style={{ width: '80%', height: 16 }} />
          <Skeleton style={{ width: 90, height: 14 }} />
        </View>
      ))}
    </Stack>
  );
}

const s = StyleSheet.create({
  intro: { paddingHorizontal: space.x1, paddingTop: space.x2 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: space.x1_5 },
  update: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: space.x1_5 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.bg.brandSolid },
  reply: {
    marginTop: space.x4,
    borderRadius: radius.r3_5,
    backgroundColor: color.bg.layerFill,
    paddingHorizontal: space.x4,
    paddingVertical: space.x3_5,
  },
  replyHead: { flexDirection: 'row', alignItems: 'center', gap: space.x1_5 },
  skeletonCard: {
    backgroundColor: color.bg.layerDefault,
    borderRadius: radius.r5,
    padding: space.x5,
    gap: space.x3,
  },
});
