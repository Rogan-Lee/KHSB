import { useLocalSearchParams } from 'expo-router';

import { Screen } from '@/design';
import { ParentReportScreen } from '@/features/parent/report-detail';
import { isReportKind } from '@/features/parent/report-kind';
import { MonthlyReportView } from '@/features/parent/report-monthly';
import { ReportNotFound } from '@/features/parent/report-parts';

/**
 * 학부모 — 리포트 한 건 (앱 네이티브). /(parent)/reports/{kind}/{id}
 * kind: mentoring | monthly | online | study-plan | consultation — 리포트함·알림 딥링크가 이 경로로 연다.
 */
export default function ParentReportRoute() {
  const params = useLocalSearchParams<{ kind?: string; id?: string }>();
  const kind = isReportKind(params.kind) ? params.kind : null;
  const id = typeof params.id === 'string' ? params.id : '';

  if (!kind || !id) {
    return (
      <Screen kind="push" title="리포트" backFallback="/(parent)/(tabs)/reports">
        <ReportNotFound />
      </Screen>
    );
  }
  // 월간 리포트는 자기 화면(Screen)까지 그린다
  if (kind === 'monthly') return <MonthlyReportView id={id} />;
  return <ParentReportScreen kind={kind} id={id} />;
}
