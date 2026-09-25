import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import {
  color,
  CONTENT_MAX_WIDTH,
  ErrorState,
  Screen,
  space,
  TABLET_WIDE,
  Text,
  useResponsive,
} from '@/design';
import {
  parentReportPaths,
  useParentQuery,
  type ParentQuery,
  type ParentReportDetail,
  type ParentReportDetailKind,
} from '@/lib/api/parent-reports';

import { ConsultationReportBody, StudyPlanReportBody } from './report-documents';
import { REPORT_KIND } from './report-kind';
import { MentoringReportBody } from './report-mentoring';
import { OnlineReportBody } from './report-online';
import { ReportSkeleton } from './report-parts';

// 학부모 리포트 한 건 — 앱이 직접 그린다 (웹 링크·WebView 없음).
//  · ParentReportScreen: 라우트 /(parent)/reports/[kind]/[id] 의 push 화면
//  · ParentReportPane:   태블릿 리포트함 TwoPane 오른쪽 패널
// 월간 리포트는 R2 의 MonthlyReportView 가 그린다.

function useReport(kind: ParentReportDetailKind, id: string) {
  return useParentQuery<ParentReportDetail>(parentReportPaths.detail(kind, id));
}

function ReportBody({ q, wide }: { q: ParentQuery<ParentReportDetail>; wide: boolean }) {
  const data = q.data;
  if (!data) return q.error ? <ErrorState message={q.error} onRetry={q.retry} /> : <ReportSkeleton />;
  switch (data.kind) {
    case 'mentoring':
      return <MentoringReportBody data={data} wide={wide} />;
    case 'online':
      return <OnlineReportBody data={data} />;
    case 'study-plan':
      return <StudyPlanReportBody data={data} />;
    case 'consultation':
      return <ConsultationReportBody data={data} />;
  }
}

/** 리포트 화면 (폰·태블릿 push). 태블릿 멘토링 리포트는 두 단(본문 | 숫자·그래프) */
export function ParentReportScreen({ kind, id }: { kind: ParentReportDetailKind; id: string }) {
  const { isTablet } = useResponsive();
  const q = useReport(kind, id);
  const wide = isTablet && kind === 'mentoring';
  return (
    <Screen
      kind="push"
      title={REPORT_KIND[kind].label}
      backFallback="/(parent)/(tabs)/reports"
      maxWidth={wide ? TABLET_WIDE : undefined}
      refreshing={q.isRefreshing}
      onRefresh={q.data ? () => void q.refresh() : undefined}>
      <ReportBody q={q} wide={wide} />
    </Screen>
  );
}

/** 태블릿 리포트함 오른쪽 패널 — 얇은 머리줄(종류 · 제목 · 날짜) + 리포트 본문 (한 단) */
export function ParentReportPane({
  kind,
  id,
  title,
  dateLabel,
}: {
  kind: ParentReportDetailKind;
  id: string;
  title: string;
  dateLabel: string;
}) {
  const q = useReport(kind, id);
  return (
    <View style={s.root}>
      <View style={s.head}>
        <Text variant="t3-bold" color="neutralSubtle">
          {REPORT_KIND[kind].label}
        </Text>
        <Text variant="t6-bold" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="t3-regular" color="neutralSubtle" tabular>
          {dateLabel}
        </Text>
      </View>
      <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={s.root}
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={q.isRefreshing}
              onRefresh={() => void q.refresh()}
              tintColor={color.fg.neutralSubtle}
              colors={[color.fg.brand]}
            />
          }>
          <View style={s.column}>
            <ReportBody q={q} wide={false} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg.layerBasement },
  head: {
    gap: space.x0_5,
    paddingHorizontal: space.x5,
    paddingVertical: space.x3,
    borderBottomWidth: 1,
    borderBottomColor: color.stroke.neutralSubtle,
    backgroundColor: color.bg.layerDefault,
  },
  content: { paddingHorizontal: space.x4, paddingTop: space.x1, paddingBottom: space.x10 },
  // 웹 리포트 본문 폭(560)과 같게
  column: { width: '100%', maxWidth: CONTENT_MAX_WIDTH + 80, alignSelf: 'center' },
});
