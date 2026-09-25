import { Image } from 'expo-image';
import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { Modal, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Press } from './press';
import { Text } from './text';
import { color, space } from './tokens';

/**
 * 사진 전체 화면 보기 — 검은 바탕, 두 손가락 확대(iOS), 여러 장이면 좌우 넘기기.
 *   const [idx, setIdx] = useState<number | null>(null);
 *   <ImageViewer images={urls} index={idx} onIndexChange={setIdx} onClose={() => setIdx(null)} />
 */
export function ImageViewer({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: string[];
  /** 보여줄 사진 순번 — null 이면 닫힘 */
  index: number | null;
  onIndexChange?: (i: number) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const uri = index != null ? images[index] : null;
  const many = images.length > 1 && index != null;
  return (
    <Modal
      visible={uri != null}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      supportedOrientations={['portrait', 'landscape']}>
      <View style={s.root}>
        {uri != null && (
          <ScrollView
            key={uri}
            maximumZoomScale={4}
            minimumZoomScale={1}
            centerContent
            bouncesZoom
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
            <Image
              source={{ uri }}
              contentFit="contain"
              style={{ width, height: height - insets.top - insets.bottom }}
              accessibilityLabel={`사진 ${index! + 1} / ${images.length}`}
            />
          </ScrollView>
        )}
        <View style={[s.bar, { paddingTop: insets.top + space.x2 }]}>
          <Press onPress={onClose} scale={0} style={s.btn} accessibilityLabel="닫기" hitSlop={8}>
            <X color={color.palette.staticWhite} size={24} strokeWidth={2.2} />
          </Press>
          {many && (
            <Text variant="t5-bold" color="staticWhite" tabular>
              {index! + 1} / {images.length}
            </Text>
          )}
          <View style={{ width: 44 }} />
        </View>
        {many && (
          <View style={[s.nav, { bottom: insets.bottom + space.x6 }]} pointerEvents="box-none">
            <Press
              onPress={() => onIndexChange?.(Math.max(0, index! - 1))}
              disabled={index === 0}
              scale={0}
              style={[s.btn, index === 0 && { opacity: 0.3 }]}
              accessibilityLabel="이전 사진">
              <ChevronLeft color={color.palette.staticWhite} size={26} strokeWidth={2.2} />
            </Press>
            <Press
              onPress={() => onIndexChange?.(Math.min(images.length - 1, index! + 1))}
              disabled={index === images.length - 1}
              scale={0}
              style={[s.btn, index === images.length - 1 && { opacity: 0.3 }]}
              accessibilityLabel="다음 사진">
              <ChevronRight color={color.palette.staticWhite} size={26} strokeWidth={2.2} />
            </Press>
          </View>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.palette.staticBlack },
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.x3,
  },
  btn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.palette.staticBlackAlpha500,
  },
  nav: {
    position: 'absolute',
    left: space.x4,
    right: space.x4,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
