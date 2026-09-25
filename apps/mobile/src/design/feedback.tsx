import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ImageViewer } from './image-viewer';
import { TAB_BAR_HEIGHT } from './screen';
import { Text } from './text';
import { color, radius, shadow, space } from './tokens';
import { Button } from './ui';

// ─── 확인 대화상자(SEED AlertDialog) · 토스트(SEED Snackbar) ──────────────
// RN Alert 는 웹에서 동작하지 않고, RN Modal 은 iOS 에서 다른 Modal(바텀시트) 위에 겹쳐 뜨지 않는다.
// 그래서 대화상자·토스트는 Modal 이 아니라 "지금 맨 위 화면층" 안의 오버레이로 그린다.
//  · 앱 루트에 <FeedbackHost/> 하나 (FeedbackProvider 가 넣음)
//  · BottomSheet / FullSheet 의 Modal 안에도 <FeedbackHost/> — 시트가 열려 있으면 시트 안에 뜬다
// 호스트는 스택으로 관리하고 가장 마지막에 등록된(=맨 위) 호스트만 그린다.

type ConfirmOptions = {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  /** 확인 버튼만 (안내용) */
  alertOnly?: boolean;
};

type ToastTone = 'default' | 'success' | 'error';

type State = {
  dialog: (ConfirmOptions & { resolve: (v: boolean) => void }) | null;
  toast: { id: number; message: string; tone: ToastTone } | null;
  viewer: { images: string[]; index: number } | null;
  hosts: string[];
};

let state: State = { dialog: null, toast: null, viewer: null, hosts: [] };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getState = () => state;

/** 화면 어디서나: const ok = await confirm({...}) */
export function confirm(o: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    // 이전 대화상자가 떠 있으면 취소로 닫고 새로 띄운다
    state.dialog?.resolve(false);
    set({ dialog: { ...o, resolve } });
  });
}

/** 화면 어디서나: toast('저장했어요', 'success') */
export function toast(message: string, tone: ToastTone = 'default') {
  set({ toast: { id: Date.now(), message, tone } });
}

/** 화면 어디서나: 사진 전체 화면 보기 — showImages([url]) · showImages(urls, 2) */
export function showImages(images: string[], index = 0) {
  if (images.length === 0) return;
  set({ viewer: { images, index: Math.min(Math.max(0, index), images.length - 1) } });
}

type FeedbackApi = { confirm: typeof confirm; toast: typeof toast };
const FeedbackContext = createContext<FeedbackApi>({ confirm, toast });
export function useFeedback(): FeedbackApi {
  return useContext(FeedbackContext);
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  return (
    <FeedbackContext.Provider value={{ confirm, toast }}>
      {children}
      <FeedbackHost />
    </FeedbackContext.Provider>
  );
}

/** 대화상자·토스트가 그려질 자리. 부모를 꽉 채우는 오버레이 — Modal 콘텐츠 최상단에 둔다. */
export function FeedbackHost({ bottomOffset }: { bottomOffset?: number }) {
  const id = useId();
  const s = useSyncExternalStore(subscribe, getState, getState);

  useEffect(() => {
    set({ hosts: [...state.hosts, id] });
    return () => set({ hosts: state.hosts.filter((h) => h !== id) });
  }, [id]);

  const top = s.hosts[s.hosts.length - 1] === id;
  if (!top || (!s.dialog && !s.toast && !s.viewer)) return null;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {s.viewer && (
        <ImageViewer
          images={s.viewer.images}
          index={s.viewer.index}
          onIndexChange={(index) => state.viewer && set({ viewer: { ...state.viewer, index } })}
          onClose={() => set({ viewer: null })}
        />
      )}
      {s.toast && (
        <Snackbar
          key={s.toast.id}
          message={s.toast.message}
          tone={s.toast.tone}
          bottomOffset={bottomOffset}
          onDone={() => set({ toast: null })}
        />
      )}
      {s.dialog && <Dialog dialog={s.dialog} />}
    </View>
  );
}

function Dialog({ dialog }: { dialog: NonNullable<State['dialog']> }) {
  const [o] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(o, { toValue: 1, duration: 160, useNativeDriver: true }).start();
  }, [o]);

  const close = useCallback(
    (v: boolean) => {
      dialog.resolve(v);
      if (state.dialog === dialog) set({ dialog: null });
    },
    [dialog]
  );

  return (
    <Animated.View style={[s.dialogBackdrop, { opacity: o }]}>
      <Pressable
        style={StyleSheet.absoluteFill}
        accessibilityLabel="닫기"
        onPress={() => !dialog.alertOnly && close(false)}
      />
      <Animated.View
        style={[s.dialog, { transform: [{ scale: o.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }]}
        accessibilityRole="alert"
        accessibilityViewIsModal>
        <View style={{ gap: space.x2 }}>
          <Text variant="t6-bold">{dialog.title}</Text>
          {dialog.message != null && (
            <Text variant="t4-regular" color="neutralMuted">
              {dialog.message}
            </Text>
          )}
        </View>
        <View style={s.dialogActions}>
          {!dialog.alertOnly && (
            <View style={{ flex: 1 }}>
              <Button variant="gray" size="lg" block onPress={() => close(false)}>
                {dialog.cancelText ?? '취소'}
              </Button>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Button
              variant={dialog.destructive ? 'danger' : dialog.alertOnly ? 'dark' : 'primary'}
              size="lg"
              block
              onPress={() => close(true)}>
              {dialog.confirmText ?? '확인'}
            </Button>
          </View>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

function Snackbar({
  message,
  tone,
  bottomOffset,
  onDone,
}: {
  message: string;
  tone: ToastTone;
  bottomOffset?: number;
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [o] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const anim = Animated.sequence([
      Animated.timing(o, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(tone === 'error' ? 3200 : 2200),
      Animated.timing(o, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]);
    anim.start(({ finished }) => finished && onDone());
    return () => anim.stop();
  }, [o, onDone, tone]);
  const dot = tone === 'success' ? color.palette.green400 : tone === 'error' ? color.palette.red400 : null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        s.snackWrap,
        {
          bottom: bottomOffset ?? insets.bottom + TAB_BAR_HEIGHT + space.x3,
          opacity: o,
          transform: [{ translateY: o.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
        },
      ]}>
      <View style={s.snack} accessibilityLiveRegion="polite">
        {dot && <View style={[s.snackDot, { backgroundColor: dot }]} />}
        <Text variant="t4-regular" color="neutralInverted" style={{ flexShrink: 1 }}>
          {message}
        </Text>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  dialogBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.bg.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.x8,
  },
  dialog: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: color.bg.layerFloating,
    borderRadius: radius.r5,
    padding: space.x5,
    gap: space.x5,
    ...shadow('s3'),
  },
  dialogActions: { flexDirection: 'row', gap: space.x2 },
  snackWrap: { position: 'absolute', left: space.x4, right: space.x4, alignItems: 'center' },
  snack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.x2,
    minHeight: 44,
    maxWidth: 480,
    paddingHorizontal: space.x4,
    paddingVertical: space.x2_5,
    borderRadius: radius.r2,
    backgroundColor: color.bg.neutralInverted,
    ...shadow('s2'),
  },
  snackDot: { width: 8, height: 8, borderRadius: 4 },
});
