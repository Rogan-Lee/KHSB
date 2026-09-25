import { FileX2 } from 'lucide-react-native';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import {
  Columns,
  EmptyState,
  ErrorState,
  ImageViewer,
  Screen,
  Stack,
  TABLET_WIDE,
  toast,
  useResponsive,
} from '@/design';
import { parentMonthlyReportPath, type ParentMonthlyReport } from '@/lib/api/parent-monthly-report';
import { useMobileQuery } from '@/lib/mobile-api';

import { MonthlyExamsSection } from './report-monthly-exams';
import {
  AdmissionSection,
  DirectorNote,
  MentoringSummarySection,
  MeritSection,
  MonthlyFooter,
  MonthlyHero,
  NoticesGroup,
  PatrolSection,
  PhotoSection,
  StudentNoteSection,
  VocabSection,
} from './report-monthly-sections';
import { MonthlyReportSkeleton } from './report-monthly-skeleton';

/**
 * 학부모 월간 리포트 — 앱 네이티브 화면 (웹 /r/monthly/[token] 과 같은 구성·순서·문구).
 * 라우트 /(parent)/reports/[kind]/[id] 가 kind=monthly 일 때 `return <MonthlyReportView id={id} />`.
 * 자체 Screen(push, "월간 리포트")·로딩 뼈대·오류·당겨서 새로고침을 가진다.
 * 태블릿: 머리글 아래 두 칸 — 왼쪽 글(의견·한마디·기록·입시·공지), 오른쪽 숫자(성적·영단어·상벌점·순찰·사진).
 */
export function MonthlyReportView({ id }: { id: string }) {
  const { isTablet } = useResponsive();
  const { data, error, isLoading, isRefreshing, refresh, retry } = useMobileQuery<ParentMonthlyReport>(
    parentMonthlyReportPath(id)
  );

  // 당겨서 새로고침 실패 — 보던 리포트는 그대로 두고 알려만 준다
  const hasData = data != null;
  useEffect(() => {
    if (error && hasData) toast(error, 'error');
  }, [error, hasData]);

  const onRefresh = useCallback(() => {
    void refresh();
  }, [refresh]);

  let body: ReactElement;
  if (!id) {
    body = <NotFound />;
  } else if (data) {
    body = <MonthlyReportBody report={data} />;
  } else if (error) {
    body = <ErrorState message={error} onRetry={() => void retry()} />;
  } else {
    body = isLoading ? <MonthlyReportSkeleton /> : <NotFound />;
  }

  return (
    <Screen
      kind="push"
      title="월간 리포트"
      maxWidth={isTablet ? TABLET_WIDE : undefined}
      backFallback="/(parent)/(tabs)/reports"
      refreshing={isRefreshing}
      onRefresh={data ? onRefresh : undefined}>
      {body}
    </Screen>
  );
}

type Viewer = { images: string[]; index: number };

/** 리포트 본문 (Screen 없음) — 데이터가 있을 때 머리글부터 맨 아래 안내까지 */
export function MonthlyReportBody({ report }: { report: ParentMonthlyReport }) {
  const { isTablet } = useResponsive();
  const [viewer, setViewer] = useState<Viewer | null>(null);

  const onImage = useCallback((src: string) => setViewer({ images: [src], index: 0 }), []);
  const onPhoto = useCallback(
    (index: number) => setViewer({ images: report.photos.map((p) => p.url), index }),
    [report.photos]
  );

  const n = report.notices;
  const hasNotices = !!n.operations || n.awards.length > 0 || !!n.recommendation;

  // ① ~ ⑨ — 보여 줄 게 있는 섹션만 (순찰 점검은 항상)
  const mentoring = report.mentoringSummary ? (
    <MentoringSummarySection key="mentoring" report={report} onImage={onImage} />
  ) : null;
  const director = report.directorComment ? <DirectorNote key="director" report={report} onImage={onImage} /> : null;
  const exams = report.exams ? <MonthlyExamsSection key="exams" exams={report.exams} /> : null;
  const vocab = report.vocab ? <VocabSection key="vocab" report={report} /> : null;
  const note = report.note ? <StudentNoteSection key="note" report={report} onImage={onImage} /> : null;
  const merits = report.merits.items.length > 0 ? <MeritSection key="merits" report={report} /> : null;
  const patrol = <PatrolSection key="patrol" report={report} />;
  const photos = report.photos.length > 0 ? <PhotoSection key="photos" report={report} onOpen={onPhoto} /> : null;
  const admission = report.admissionInfo ? (
    <AdmissionSection key="admission" report={report} onImage={onImage} />
  ) : null;
  const notices = hasNotices ? <NoticesGroup key="notices" report={report} onImage={onImage} /> : null;

  const narrative = [mentoring, director, note, admission, notices].filter(Boolean);
  const numbers = [exams, vocab, merits, patrol, photos].filter(Boolean);

  return (
    <Stack>
      <MonthlyHero report={report} />
      {isTablet && narrative.length > 0 ? (
        <Columns left={narrative} right={numbers} leftFlex={1.15} />
      ) : (
        <Stack>
          {[mentoring, director, exams, vocab, note, merits, patrol, photos, admission, notices].filter(Boolean)}
        </Stack>
      )}
      <MonthlyFooter report={report} />
      <ImageViewer
        images={viewer?.images ?? []}
        index={viewer?.index ?? null}
        onIndexChange={(index) => setViewer((v) => (v ? { ...v, index } : v))}
        onClose={() => setViewer(null)}
      />
    </Stack>
  );
}

function NotFound() {
  return (
    <EmptyState
      icon={FileX2}
      title="리포트를 찾을 수 없어요"
      description={'삭제되었거나 볼 수 없는 리포트예요.\n리포트함에서 다시 골라 주세요.'}
    />
  );
}
