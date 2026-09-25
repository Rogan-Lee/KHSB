import { ReactNode, useEffect } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { MousePointerClick } from 'lucide-react-native';

import { color, EmptyState, space } from '@/design';
import { useResponsive } from '@/lib/responsive';

/**
 * 마스터-디테일 반응형 컨테이너.
 * - 태블릿(가로): 좌측 고정폭 마스터 목록 + 우측 디테일 패널 나란히.
 *   디테일 미선택 시 우측에 빈 상태 안내를 표시한다.
 * - 폰: 마스터만 보이고, detailVisible 이면 디테일을 풀스크린으로
 *   (Android 하드웨어 뒤로가기 → onCloseDetail).
 * 디테일 노드의 닫기/뒤로가기 UI는 노드 자신이 제공한다(FullSheet 헤더, ChatThread onBack 등).
 */
export function TwoPane({
  master,
  detail,
  detailVisible = false,
  onCloseDetail,
  masterWidth = 400,
  emptyTitle = '항목을 선택하세요',
  emptyMessage = '왼쪽 목록에서 항목을 고르면 여기에 자세히 보여요.',
}: {
  master: ReactNode;
  detail?: ReactNode;
  detailVisible?: boolean;
  onCloseDetail?: () => void;
  masterWidth?: number;
  emptyTitle?: string;
  emptyMessage?: string;
}) {
  const { isTablet } = useResponsive();
  const phoneDetail = !isTablet && detailVisible && detail != null;

  useEffect(() => {
    if (!phoneDetail || !onCloseDetail) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onCloseDetail();
      return true;
    });
    return () => sub.remove();
  }, [phoneDetail, onCloseDetail]);

  if (!isTablet) {
    return <>{phoneDetail ? detail : master}</>;
  }

  return (
    <View style={styles.split}>
      <View style={[styles.master, { width: masterWidth }]}>{master}</View>
      <View style={styles.detail}>
        {detailVisible && detail != null ? (
          detail
        ) : (
          <View style={styles.empty}>
            <EmptyState icon={MousePointerClick} title={emptyTitle} description={emptyMessage} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  split: { flex: 1, flexDirection: 'row', backgroundColor: color.bg.layerBasement },
  master: { borderRightColor: color.stroke.neutralSubtle, borderRightWidth: 1 },
  detail: { flex: 1, backgroundColor: color.bg.layerDefault },
  empty: { flex: 1, justifyContent: 'center', paddingHorizontal: space.x6 },
});
