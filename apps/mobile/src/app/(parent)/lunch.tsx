import { Users } from 'lucide-react-native';
import { useMemo } from 'react';

import { EmptyState } from '@/design';
import { useChildQuery } from '@/features/parent/child-query';
import type { LunchAdapter, LunchData, LunchFrameConfig } from '@/features/lunch/adapter';
import { LunchFrame } from '@/features/lunch/frame';
import { LunchFlow } from '@/features/lunch/lunch-flow';
import {
  claimLunchDeposit,
  parentServicePaths,
  requestLunchChange,
  saveLunchOrder,
} from '@/lib/api/parent-services';
import { useParentChild } from '@/lib/parent-child';

/**
 * 학부모 도시락 신청 — 웹 /meal/[token] 폼의 네이티브판 (학생 화면과 같은 LunchFlow).
 * 학생 매직링크 토큰 없이 학부모 계정(ParentLink)으로 인증하고, 모든 요청에 자녀 id 를 싣는다.
 */
const PARENT_FRAME: LunchFrameConfig = { backFallback: '/(parent)/(tabs)/menu', childSwitcher: true };

function parentLunchAdapter(studentId: string): LunchAdapter {
  return {
    ...PARENT_FRAME,
    key: studentId,
    audience: 'parent',
    saveOrder: (menuIds, memo) => saveLunchOrder(studentId, menuIds, memo),
    claimDeposit: () => claimLunchDeposit(studentId),
    requestChange: (message) => requestLunchChange(studentId, message),
  };
}

export default function ParentLunchScreen() {
  const { selected } = useParentChild();
  const childId = selected?.id ?? null;
  const query = useChildQuery<LunchData>(childId ? parentServicePaths.lunch(childId) : null, childId);
  const adapter = useMemo(() => (childId ? parentLunchAdapter(childId) : null), [childId]);

  if (!adapter) {
    return (
      <LunchFrame frame={PARENT_FRAME}>
        <EmptyState icon={Users} title="연결된 자녀가 없어요" description="자녀를 먼저 연결해 주세요." />
      </LunchFrame>
    );
  }
  return <LunchFlow adapter={adapter} query={query} />;
}
