import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Image, StyleSheet, View } from 'react-native';

import { Button, Text, color, space } from '@/design';
import { roleHome } from '@/lib/api/auth';
import { useSession } from '@/lib/session';

/** 진입 화면 — 세션 확인 후 역할 홈 또는 로그인으로 보낸다. */
export default function EntryScreen() {
  const { session, status } = useSession();

  if (status === 'loading') return <SplashLoading />;
  if (!session) return <Redirect href="/(auth)" />;
  return <Redirect href={roleHome(session.role)} />;
}

const INDICATOR_DELAY_MS = 500;
const SLOW_HINT_MS = 8000;

/**
 * 네이티브 스플래시(흰 바탕 + 로고 112px, app.json expo-splash-screen)와 같은 자리에 로고를 두고,
 * 확인이 길어질 때만 아래에 작은 표시를 띄운다 — 스플래시에서 화면이 튀지 않게.
 */
function SplashLoading() {
  const { refreshProfile } = useSession();
  const [indicator] = useState(() => new Animated.Value(0));
  const [slow, setSlow] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const anim = Animated.sequence([
      Animated.delay(INDICATOR_DELAY_MS),
      Animated.timing(indicator, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]);
    anim.start();
    const timer = setTimeout(() => setSlow(true), SLOW_HINT_MS);
    return () => {
      anim.stop();
      clearTimeout(timer);
    };
  }, [indicator]);

  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await refreshProfile();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <View style={s.root} accessibilityLabel="강한선배를 여는 중" accessibilityRole="progressbar">
      <Image source={require('@/assets/images/splash-icon.png')} style={s.logo} resizeMode="contain" />
      <Animated.View style={[s.below, { opacity: indicator }]}>
        <ActivityIndicator color={color.fg.neutralSubtle} />
        {slow && (
          <View style={{ alignItems: 'center', gap: space.x3, marginTop: space.x2 }}>
            <Text variant="t4-regular" color="neutralSubtle" align="center">
              연결이 조금 느려요. 네트워크 상태를 확인해 주세요.
            </Text>
            <Button variant="gray" size="sm" loading={retrying} onPress={() => void retry()}>
              다시 시도
            </Button>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const LOGO_SIZE = 112;

const s = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bg.layerDefault,
  },
  logo: { width: LOGO_SIZE, height: LOGO_SIZE },
  below: {
    position: 'absolute',
    top: '50%',
    left: space.x6,
    right: space.x6,
    marginTop: LOGO_SIZE / 2 + space.x8,
    alignItems: 'center',
    gap: space.x2,
  },
});
