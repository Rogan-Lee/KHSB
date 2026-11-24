const { withAndroidManifest } = require('expo/config-plugins');

// Play 는 세로 고정(orientation: portrait)·ACCESS_WIFI_STATE 를 보고 화면 세로·와이파이를 '필수 하드웨어'로 추정해
// 태블릿·데스크톱·XR 설치를 막고 검토 제출까지 막는다. 둘 다 없어도 앱은 돌아가니 선택으로 선언한다.
const OPTIONAL_FEATURES = ['android.hardware.screen.portrait', 'android.hardware.wifi'];

const withOptionalFeatures = (config) =>
  withAndroidManifest(config, (c) => {
    const m = c.modResults.manifest;
    m['uses-feature'] = [
      ...(m['uses-feature'] ?? []).filter((f) => !OPTIONAL_FEATURES.includes(f.$['android:name'])),
      ...OPTIONAL_FEATURES.map((name) => ({ $: { 'android:name': name, 'android:required': 'false' } })),
    ];
    return c;
  });

// google-services.json(안드로이드 FCM 푸시)은 공개 저장소에 두지 않는다 —
// EAS 파일 환경변수 GOOGLE_SERVICES_JSON 이 빌드 때 그 파일 경로를 넘겨 준다. 없으면 FCM 없이 빌드된다.
module.exports = ({ config }) =>
  withOptionalFeatures({
    ...config,
    android: { ...config.android, googleServicesFile: process.env.GOOGLE_SERVICES_JSON },
  });
