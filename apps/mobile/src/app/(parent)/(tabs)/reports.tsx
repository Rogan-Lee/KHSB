import { useRouter, type Href } from 'expo-router';
import { UserRound } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';

import { TwoPane } from '@/components/two-pane';
import { color, EmptyState, ErrorState, Screen, space, useMasterDetail } from '@/design';
import { ParentReportPane } from '@/features/parent/report-detail';
import { formatReportDate } from '@/features/parent/report-format';
import { ReportInbox, ReportInboxSkeleton, type ReportFilter } from '@/features/parent/report-inbox';
import {
  parentReportPaths,
  parentReportRoute,
  useParentQuery,
  type ParentReportInboxResponse,
  type ParentReportItem,
} from '@/lib/api/parent-reports';
import { refreshBadges } from '@/lib/badges';
import { ChildSwitcher, useParentChild } from '@/lib/parent-child';

const reportHref = (item: ParentReportItem) => parentReportRoute(item.kind, item.id) as Href;

/** 학부모 리포트함 — 멘토링·월간·온라인 관리·공부 계획·상담 리포트를 한곳에서 (모두 앱 안 네이티브 화면) */
export default function ParentReportsScreen() {
  const router = useRouter();
  const { selected } = useParentChild();
  const [filter, setFilter] = useState<ReportFilter>('all');
  const q = useParentQuery<ParentReportInboxResponse>(selected ? parentReportPaths.inbox(selected.id) : null);
  const data = q.data;

  const byKey = useMemo(() => new Map((data?.reports ?? []).map((r) => [r.key, r] as const)), [data]);
  const md = useMasterDetail(
    useCallback(
      (key: string) => {
        const item = byKey.get(key);
        return item ? reportHref(item) : ('/(parent)/(tabs)/reports' as Href);
      },
      [byKey]
    )
  );

  // 월간 리포트는 넓은 대시보드형이라 태블릿에서도 전체 화면으로 연다
  const open = (item: ParentReportItem) => {
    if (md.isTablet && item.kind === 'monthly') router.push(reportHref(item));
    else md.open(item.key);
  };

  const refresh = async () => {
    await q.refresh();
    refreshBadges();
  };

  const body = !selected ? (
    <EmptyState
      icon={UserRound}
      title="연결된 자녀가 없어요"
      description="독서실에서 받은 초대 코드로 자녀를 연결해 주세요."
    />
  ) : data ? (
    <ReportInbox
      data={data}
      filter={filter}
      onFilter={setFilter}
      onOpen={open}
      selectedKey={md.selectedId}
    />
  ) : q.error ? (
    <ErrorState message={q.error} onRetry={q.retry} />
  ) : (
    <ReportInboxSkeleton />
  );

  // 태블릿 — 왼쪽 목록 + 오른쪽 리포트 본문
  if (md.isTablet) {
    const current = md.selectedId ? byKey.get(md.selectedId) : undefined;
    const pane = current && current.kind !== 'monthly' ? current : undefined;
    return (
      <Screen kind="tab" title="리포트" right={<ChildSwitcher />} scroll={false} maxWidth={0}>
        <TwoPane
          masterWidth={420}
          emptyTitle="리포트를 골라 주세요"
          emptyMessage="왼쪽 목록에서 리포트를 누르면 여기에서 바로 볼 수 있어요."
          detailVisible={!!pane}
          onCloseDetail={md.close}
          master={
            <ScrollView
              contentContainerStyle={s.master}
              refreshControl={
                <RefreshControl
                  refreshing={q.isRefreshing}
                  onRefresh={() => void refresh()}
                  tintColor={color.fg.neutralSubtle}
                  colors={[color.fg.brand]}
                />
              }>
              {body}
            </ScrollView>
          }
          detail={
            pane && pane.kind !== 'monthly' ? (
              <ParentReportPane
                key={pane.key}
                kind={pane.kind}
                id={pane.id}
                title={pane.title}
                dateLabel={formatReportDate(pane.date)}
              />
            ) : null
          }
        />
      </Screen>
    );
  }

  return (
    <Screen
      kind="tab"
      title="리포트"
      right={<ChildSwitcher />}
      refreshing={q.isRefreshing}
      onRefresh={selected ? () => void refresh() : undefined}>
      {body}
    </Screen>
  );
}

const s = StyleSheet.create({
  master: { padding: space.x4, paddingBottom: space.x10 },
});
