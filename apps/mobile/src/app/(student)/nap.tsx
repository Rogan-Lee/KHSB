import { useRef, useState } from 'react';

import { Columns, ErrorState, Screen, TABLET_WIDE, toast, useResponsive } from '@/design';
import { nowKSTTime } from '@/features/student-life/format';
import { NapForm, NapHistory, NapQuotaCard, NapSkeleton } from '@/features/student-life/nap-sections';
import { SubmitBlock } from '@/features/student-life/ui';
import { NAP_PATH, requestNap, type StudentNapResponse } from '@/lib/api/student-life';
import { useMobileQuery } from '@/lib/mobile-api';

// 쪽잠 신청 — 웹 포털 /s/[token]/nap 과 같은 구성:
// 오늘 남은 횟수 → 신청 폼(시작 시간·20/30분) → 최근 신청(오늘 + 7일) → 하단 "쪽잠 신청하기".
// 규칙(하루 2회, REJECTED 제외, 오늘 날짜로만)은 서버 student-nap-core 가 웹과 같이 검증한다.
// 태블릿: 왼쪽(남은 횟수·폼·신청 버튼) | 오른쪽(최근 신청).

export default function StudentNapScreen() {
  const { isTablet } = useResponsive();
  const { data, error, isRefreshing, refresh, retry } = useMobileQuery<StudentNapResponse>(NAP_PATH);

  const [startTime, setStartTime] = useState(nowKSTTime);
  const [durationMin, setDurationMin] = useState(20);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);

  const limit = data?.limit ?? 0;
  const remaining = Math.max(0, limit - (data?.todayCount ?? 0));

  const submit = async () => {
    if (busy.current || remaining === 0) return;
    busy.current = true;
    setPending(true);
    try {
      await requestNap({ startTime, durationMin });
      toast('쪽잠 신청이 접수되었어요', 'success');
      void refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : '신청에 실패했어요', 'error');
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  const submitBlock = data ? (
    <SubmitBlock
      note={remaining > 0 ? `직원 승인 후 이용할 수 있어요 · 오늘 ${remaining}회 남음` : undefined}
      label="쪽잠 신청하기"
      loading={pending}
      disabled={remaining === 0}
      onPress={() => void submit()}
    />
  ) : null;

  return (
    <Screen
      kind="push"
      title="쪽잠 신청"
      backFallback="/(student)/(tabs)/menu"
      maxWidth={isTablet ? TABLET_WIDE : undefined}
      refreshing={isRefreshing}
      onRefresh={data ? () => void refresh() : undefined}
      footer={!isTablet ? submitBlock : undefined}>
      {!data ? (
        error ? (
          <ErrorState message={error} onRetry={() => void retry()} />
        ) : (
          <NapSkeleton tablet={isTablet} />
        )
      ) : (
        <Columns
          left={
            <>
              <NapQuotaCard remaining={remaining} limit={limit} todayCount={data.todayCount} />
              {remaining > 0 && (
                <NapForm
                  startTime={startTime}
                  onStartTime={setStartTime}
                  durationMin={durationMin}
                  onDuration={setDurationMin}
                  durations={data.durations.length > 0 ? data.durations : [20, 30]}
                  disabled={pending}
                  initialDraft={nowKSTTime}
                />
              )}
              {isTablet && submitBlock}
            </>
          }
          right={<NapHistory naps={data.naps} today={data.today} />}
        />
      )}
    </Screen>
  );
}
