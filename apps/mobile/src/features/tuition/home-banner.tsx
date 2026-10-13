import type { Href } from 'expo-router';
import { Receipt, X } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { color, IconTile, Press, radius, space, Text } from '@/design';
import type { ParentTuitionBanner } from '@/lib/api/parent-tuition';

import { bannerKey, shouldShowBanner } from './banner-state';
import { dismissTuitionBanner, useDismissedTuitionBanners } from './banner-store';
import { bannerSubtitle, bannerTitle } from './format';

// typed routes 생성 전에도 컴파일되도록 Href 로 고정
const TUITION_ROUTE = '/(parent)/tuition' as Href;

/**
 * 홈 맨 위 수강료 알림 — 결제할 청구서가 있을 때만 보이고, 닫으면 그 청구서·상태에서는 다시 뜨지 않는다
 * (결제 요청 때 닫았어도 미납이 되면 다시 보인다 — banner-state.ts).
 * 카드를 누르면 수강료 화면으로, X 는 닫기만 한다. 웹에서 버튼 안에 버튼이 들어가지 않게
 * X 는 카드 누름 영역의 자식이 아니라 형제로 둔다 (design/press.tsx 참고).
 */
export function TuitionHomeBanner({ banner }: { banner: ParentTuitionBanner | undefined }) {
  const dismissed = useDismissedTuitionBanners();
  if (!banner || !shouldShowBanner(banner, dismissed)) return null;

  const title = bannerTitle(banner);
  const subtitle = bannerSubtitle(banner);

  return (
    <View style={s.card}>
      <Press
        href={TUITION_ROUTE}
        scale={0}
        pressedBg
        accessibilityLabel={`${title}, ${subtitle}`}
        accessibilityHint="수강료 화면으로 이동해요"
        style={s.main}>
        <IconTile icon={Receipt} tone={banner.overdue ? 'bad' : 'info'} size={44} />
        <View style={s.text}>
          <Text variant="t5-bold" tabular numberOfLines={2}>
            {title}
          </Text>
          <Text variant="t4-regular" color={banner.overdue ? 'critical' : 'neutralSubtle'} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      </Press>
      <Press
        onPress={() => dismissTuitionBanner(bannerKey(banner))}
        scale={0}
        pressedBg
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="닫기"
        style={s.close}>
        <X color={color.fg.neutralSubtle} size={20} strokeWidth={2.2} />
      </Press>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x1,
    backgroundColor: color.bg.layerDefault,
    borderRadius: radius.r5,
    paddingVertical: space.x2,
    paddingLeft: space.x2,
    paddingRight: space.x2_5,
  },
  main: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x3,
    paddingHorizontal: space.x3,
    paddingVertical: space.x2_5,
    borderRadius: radius.r4,
  },
  text: { flex: 1, minWidth: 0, gap: space.x0_5 },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
