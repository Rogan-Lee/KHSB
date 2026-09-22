import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { ErrorState, LoadingState } from '@/components/mobile-ui';
import { colors, spacing } from '@/constants/theme';
import { requestMobileApi } from '@/lib/mobile-api';

type PortalTokenResponse = {
  token: string;
  expiresAt: string;
  baseUrl: string;
};

/**
 * 학생 포털(`/s/[token]`) 웹뷰 브리지.
 * 매직링크 토큰을 발급받아 `${baseUrl}/s/${token}${path}` 를 로드한다.
 */
export function PortalWebView({ path, title }: { path: string; title: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setUrl(null);
    try {
      const data = await requestMobileApi<PortalTokenResponse>(
        '/api/mobile/v1/student/portal-token',
      );
      setUrl(`${data.baseUrl}/s/${data.token}${path}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '포털을 불러오지 못했습니다.');
    }
  }, [path]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
      </View>
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !url ? (
        <LoadingState label="포털 여는 중" />
      ) : (
        <WebView
          source={{ uri: url }}
          style={styles.web}
          startInLoadingState
          renderLoading={() => (
            <View style={[StyleSheet.absoluteFill, styles.loadingOverlay]}>
              <LoadingState label="불러오는 중" />
            </View>
          )}
          renderError={() => (
            <ErrorState message="페이지를 불러오지 못했습니다." onRetry={load} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.canvas,
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  web: {
    flex: 1,
  },
  loadingOverlay: {
    backgroundColor: colors.canvas,
  },
});
