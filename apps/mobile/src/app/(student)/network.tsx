import { useRef, useState } from 'react';

import { Columns, ErrorState, Screen, TABLET_WIDE, toast, useResponsive } from '@/design';
import { todayKSTStr } from '@/features/student-life/format';
import {
  NetworkForm,
  NetworkHistory,
  NetworkSkeleton,
  type NetworkFormState,
} from '@/features/student-life/network-sections';
import { SubmitBlock } from '@/features/student-life/ui';
import {
  NETWORK_PATH,
  NETWORK_TARGET_META,
  requestNetwork,
  type StudentNetworkResponse,
} from '@/lib/api/student-life';
import { useMobileQuery } from '@/lib/mobile-api';

// 네트워크 사용 신청 — 웹 포털 /s/[token]/network 와 같은 구성:
// 신청 폼(유형·대상·날짜·사용 시간·사유) → 신청 내역 → 하단 "사용 신청하기".
// 검증 규칙은 서버 student-network-core 가 웹과 같이 검증한다(아래는 웹과 같은 사전 안내).
// 태블릿: 왼쪽(폼·신청 버튼) | 오른쪽(신청 내역).

export default function StudentNetworkScreen() {
  const { isTablet } = useResponsive();
  const { data, error, isRefreshing, refresh, retry } = useMobileQuery<StudentNetworkResponse>(NETWORK_PATH);

  const [form, setForm] = useState<NetworkFormState>(() => ({
    kind: 'WIFI_UNBLOCK',
    target: '',
    date: todayKSTStr(),
    startTime: '',
    endTime: '',
    reason: '',
  }));
  const [pending, setPending] = useState(false);
  const busy = useRef(false);

  const submit = async () => {
    if (busy.current) return;
    const targetMeta = NETWORK_TARGET_META[form.kind];
    if (targetMeta && !form.target.trim()) return toast(`${targetMeta.label}을(를) 입력해 주세요`, 'error');
    if (!form.date || !form.startTime || !form.endTime) return toast('사용 시간을 선택해 주세요', 'error');
    if (!form.reason.trim()) return toast('사용 사유를 입력해 주세요', 'error');

    busy.current = true;
    setPending(true);
    try {
      await requestNetwork({
        kind: form.kind,
        target: targetMeta ? form.target : undefined,
        startAt: `${form.date}T${form.startTime}`,
        endAt: `${form.date}T${form.endTime}`,
        reason: form.reason,
      });
      toast('네트워크 사용 신청이 접수되었어요', 'success');
      setForm((f) => ({ ...f, target: '', startTime: '', endTime: '', reason: '' }));
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
      note="직원 승인 후 사용할 수 있어요"
      label="사용 신청하기"
      loading={pending}
      onPress={() => void submit()}
    />
  ) : null;

  return (
    <Screen
      kind="push"
      title="네트워크 사용"
      backFallback="/(student)/(tabs)/menu"
      maxWidth={isTablet ? TABLET_WIDE : undefined}
      refreshing={isRefreshing}
      onRefresh={data ? () => void refresh() : undefined}
      footer={!isTablet ? submitBlock : undefined}>
      {!data ? (
        error ? (
          <ErrorState message={error} onRetry={() => void retry()} />
        ) : (
          <NetworkSkeleton tablet={isTablet} />
        )
      ) : (
        <Columns
          left={
            <>
              <NetworkForm
                value={form}
                onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
                disabled={pending}
              />
              {isTablet && submitBlock}
            </>
          }
          right={<NetworkHistory requests={data.requests} />}
        />
      )}
    </Screen>
  );
}
