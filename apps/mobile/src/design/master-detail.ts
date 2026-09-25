import { useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';

import { useResponsive } from '@/lib/responsive';

/**
 * 목록 → 상세 이동 규칙.
 *  · 폰: 상세 라우트로 push (웹 포털처럼 뒤로가기 + 가운데 제목 화면)
 *  · 태블릿: 같은 화면의 TwoPane 오른쪽 패널에 상세를 띄움 (selectedId)
 *
 *   const md = useMasterDetail((id) => `/(student)/tasks/${id}`);
 *   <ListRow onPress={() => md.open(task.id)} />
 *   <TwoPane master={…} detail={md.selectedId ? <TaskDetail id={md.selectedId} inline /> : null}
 *            detailVisible={!!md.selectedId} onCloseDetail={md.close} />
 */
export function useMasterDetail(route: (id: string) => Href) {
  const router = useRouter();
  const { isTablet } = useResponsive();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const open = useCallback(
    (id: string) => {
      if (isTablet) setSelectedId(id);
      else router.push(route(id));
    },
    [isTablet, router, route]
  );
  const close = useCallback(() => setSelectedId(null), []);

  return { isTablet, selectedId: isTablet ? selectedId : null, open, close };
}
