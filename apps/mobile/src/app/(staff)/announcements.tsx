import { Megaphone, Pencil, Plus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import {
  Button,
  EmptyState,
  ErrorState,
  FullSheet,
  HeaderIconButton,
  Notice,
  Press,
  Screen,
  Section,
  Segmented,
  Stack,
  Text,
  TextField,
  confirm,
  space,
  toast,
} from '@/design';
import { errorText, usePullRefresh } from '@/features/staff-home/hooks';
import { kstDateTime, plainMarkdown } from '@/features/staff-home/format';
import { ListSkeleton } from '@/features/staff-home/ui';
import {
  createAnnouncement,
  deleteAnnouncement,
  STAFF_API,
  updateAnnouncement,
  type AnnouncementItem,
  type AnnouncementPage,
  type StaffAnnouncementsResponse,
} from '@/lib/api/staff-home';
import { requestMobileApi, useMobileQuery } from '@/lib/mobile-api';
import { useResponsive } from '@/lib/responsive';

const PAGES: { value: AnnouncementPage; label: string }[] = [
  { value: 'mentoring', label: '멘토링 공지' },
  { value: 'monthly_notice', label: '운영 공지' },
  { value: 'monthly_recommendation', label: '이달의 권장' },
];

type Editing = { mode: 'create' } | { mode: 'edit'; item: AnnouncementItem };

/** 공지 — 멘토링 공지(목록) · 월간 리포트 공통 공지(최신 1건). 원장은 작성·수정. */
export default function StaffAnnouncementsScreen() {
  const { isTablet } = useResponsive();
  const [page, setPage] = useState<AnnouncementPage>('mentoring');
  const { data, error, refresh, retry } = useMobileQuery<StaffAnnouncementsResponse>(
    STAFF_API.announcements(page)
  );
  const { refreshing, onRefresh } = usePullRefresh(refresh);
  const [editing, setEditing] = useState<Editing | null>(null);
  const current = data && data.page === page ? data : null;
  const canEdit = !!current?.canEdit;

  return (
    <Screen
      kind="push"
      title="공지"
      backFallback="/(staff)/(tabs)/menu"
      maxWidth={isTablet ? 720 : undefined}
      right={
        canEdit && current?.history ? (
          <HeaderIconButton icon={Plus} label="공지 쓰기" onPress={() => setEditing({ mode: 'create' })} />
        ) : undefined
      }
      refreshing={refreshing}
      onRefresh={onRefresh}>
      <Stack>
        <Segmented value={page} onChange={setPage} options={PAGES} />

        {page !== 'mentoring' && (
          <Notice tone="info" icon={Megaphone}>
            {page === 'monthly_notice'
              ? '가장 최근 운영 공지가 모든 학부모의 월간 리포트에 함께 보여요.'
              : '가장 최근 권장 학습이 모든 학부모의 월간 리포트에 함께 보여요.'}
          </Notice>
        )}

        {!current ? (
          error ? (
            <ErrorState message={error} onRetry={() => void retry()} />
          ) : (
            <Stack>
              <ListSkeleton rows={2} />
              <ListSkeleton rows={2} />
            </Stack>
          )
        ) : current.history ? (
          <MentoringList
            key={page}
            first={current}
            canEdit={canEdit}
            onEdit={(item) => setEditing({ mode: 'edit', item })}
            onChanged={refresh}
          />
        ) : current.items[0] ? (
          <AnnouncementCard
            item={current.items[0]}
            expandedByDefault
            canEdit={canEdit}
            onEdit={() => setEditing({ mode: 'edit', item: current.items[0] })}
          />
        ) : (
          <Section>
            <EmptyState
              icon={Megaphone}
              title="아직 작성된 공지가 없어요"
              description={canEdit ? '작성하면 이번 달 학부모 리포트에 바로 보여요' : undefined}
              action={
                canEdit ? (
                  <Button size="md" variant="weak" icon={Pencil} onPress={() => setEditing({ mode: 'create' })}>
                    작성하기
                  </Button>
                ) : undefined
              }
            />
          </Section>
        )}
      </Stack>

      {editing && current && (
        <EditorSheet
          key={editing.mode === 'edit' ? editing.item.id : `new-${page}`}
          page={page}
          label={current.label}
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      )}
    </Screen>
  );
}

/** 멘토링 공지 목록 — 처음 20개 + "이전 공지 더 보기" */
function MentoringList({
  first,
  canEdit,
  onEdit,
  onChanged,
}: {
  first: StaffAnnouncementsResponse;
  canEdit: boolean;
  onEdit: (item: AnnouncementItem) => void;
  onChanged: () => Promise<void>;
}) {
  const [more, setMore] = useState<{ base: StaffAnnouncementsResponse; items: AnnouncementItem[]; next: number | null }>({
    base: first,
    items: [],
    next: first.nextOffset,
  });
  const [loadingMore, setLoadingMore] = useState(false);
  // 첫 페이지가 새로고침되면 덧붙인 목록은 버린다
  const extra = more.base === first ? more : { base: first, items: [], next: first.nextOffset };
  const items = [...first.items, ...extra.items];

  async function loadMore() {
    if (loadingMore || extra.next == null) return;
    setLoadingMore(true);
    try {
      const res = await requestMobileApi<StaffAnnouncementsResponse>(
        `${STAFF_API.announcements('mentoring')}&offset=${extra.next}`
      );
      setMore({ base: first, items: [...extra.items, ...res.items], next: res.nextOffset });
    } catch (e) {
      toast(errorText(e, '공지를 더 불러오지 못했어요'), 'error');
    } finally {
      setLoadingMore(false);
    }
  }

  async function remove(item: AnnouncementItem) {
    const ok = await confirm({
      title: '이 공지를 지울까요?',
      message: '지운 공지는 되돌릴 수 없어요.',
      confirmText: '삭제',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteAnnouncement(item.id);
      toast('공지를 지웠어요', 'success');
      await onChanged();
    } catch (e) {
      toast(errorText(e, '공지를 지우지 못했어요'), 'error');
    }
  }

  if (items.length === 0) {
    return (
      <Section>
        <EmptyState icon={Megaphone} title="아직 멘토링 공지가 없어요" />
      </Section>
    );
  }

  return (
    <Stack>
      {items.map((item, i) => (
        <AnnouncementCard
          key={item.id}
          item={item}
          latest={i === 0}
          expandedByDefault={i === 0}
          canEdit={canEdit}
          onEdit={() => onEdit(item)}
          onDelete={() => void remove(item)}
        />
      ))}
      {extra.next != null && (
        <Button variant="gray" size="md" block loading={loadingMore} onPress={() => void loadMore()}>
          {`이전 공지 더 보기 (${first.total - items.length}개)`}
        </Button>
      )}
    </Stack>
  );
}

function AnnouncementCard({
  item,
  latest,
  expandedByDefault = false,
  canEdit,
  onEdit,
  onDelete,
}: {
  item: AnnouncementItem;
  latest?: boolean;
  expandedByDefault?: boolean;
  canEdit: boolean;
  onEdit: () => void;
  onDelete?: () => void;
}) {
  const [expanded, setExpanded] = useState(expandedByDefault);
  const body = plainMarkdown(item.content);
  const long = body.length > 160 || body.split('\n').length > 5;

  return (
    <Section
      title={item.title || '제목 없는 공지'}
      description={`${item.authorName} · ${kstDateTime(item.updatedAt)}${latest ? ' · 최신' : ''}`}>
      <Stack gap={space.x3}>
        <Text variant="t5-regular" selectable numberOfLines={expanded || !long ? undefined : 5}>
          {body}
        </Text>
        {long && (
          <Press onPress={() => setExpanded((v) => !v)} scale={0} hitSlop={8} accessibilityLabel={expanded ? '접기' : '더 보기'}>
            <Text variant="t4-medium" color="neutralSubtle">
              {expanded ? '접기' : '더 보기'}
            </Text>
          </Press>
        )}
        {canEdit && (
          <View style={{ flexDirection: 'row', gap: space.x2 }}>
            <Button size="sm" variant="gray" icon={Pencil} onPress={onEdit}>
              수정
            </Button>
            {onDelete && (
              <Button size="sm" variant="ghost" icon={Trash2} onPress={onDelete} accessibilityLabel="공지 삭제">
                삭제
              </Button>
            )}
          </View>
        )}
      </Stack>
    </Section>
  );
}

function EditorSheet({
  page,
  label,
  editing,
  onClose,
  onSaved,
}: {
  page: AnnouncementPage;
  label: string;
  editing: Editing;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const initial = editing.mode === 'edit' ? editing.item : null;
  const withTitle = page === 'mentoring';
  const [title, setTitle] = useState(initial?.title ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    if (!content.trim()) {
      toast('공지 내용을 적어 주세요', 'error');
      return;
    }
    setSaving(true);
    try {
      const t = withTitle ? title.trim() : initial?.title || label;
      if (initial) await updateAnnouncement(initial.id, t, content.trim());
      else await createAnnouncement(page, t, content.trim());
      toast(initial ? '공지를 고쳤어요' : '공지를 올렸어요', 'success');
      await onSaved();
    } catch (e) {
      toast(errorText(e, '공지를 저장하지 못했어요'), 'error');
      setSaving(false);
    }
  }

  return (
    <FullSheet
      visible
      onClose={onClose}
      title={initial ? `${label} 수정` : `${label} 쓰기`}
      footer={
        <View style={{ flex: 1 }}>
          <Button block loading={saving} disabled={!content.trim()} onPress={() => void save()}>
            {initial ? '고치기' : '올리기'}
          </Button>
        </View>
      }>
      {withTitle && (
        <TextField
          label="제목"
          indicator="선택"
          value={title}
          onChangeText={setTitle}
          maxLength={100}
          placeholder="예: 이번 주 멘토링 일정 안내"
        />
      )}
      <TextField
        label="내용"
        value={content}
        onChangeText={setContent}
        multiline
        minHeight={260}
        maxLength={20000}
        showCount
        placeholder="웹과 같은 마크다운 문법을 쓸 수 있어요"
      />
    </FullSheet>
  );
}
