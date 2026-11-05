// google-services.json(안드로이드 FCM 푸시)은 공개 저장소에 두지 않는다 —
// EAS 파일 환경변수 GOOGLE_SERVICES_JSON 이 빌드 때 그 파일 경로를 넘겨 준다. 없으면 FCM 없이 빌드된다.
module.exports = ({ config }) => ({
  ...config,
  android: { ...config.android, googleServicesFile: process.env.GOOGLE_SERVICES_JSON },
});
