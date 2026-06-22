# 모바일 앱 EAS 배포

`apps/mobile`에서 명령을 실행한다. 인증서, API 키, 비밀번호 파일은 저장소에
커밋하지 않고 EAS 원격 자격 증명 또는 EAS 환경변수로 관리한다.

## 1. Expo 프로젝트 연결

현재 `@rogan_lee/study-room-manager-mobile` 프로젝트가 연결되어 있다. 아래 명령은
프로젝트를 다시 연결해야 할 때만 실행한다.

```bash
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest init
```

`eas init`이 완료되면 `app.json`의 `expo.extra.eas.projectId`가 생성되었는지
확인한다. 모바일 앱은 이 값을 사용해 Expo Push Token을 발급한다.

```bash
npx eas-cli@latest project:info
npx expo config --type public
```

## 2. iOS 테스트 기기와 푸시 자격 증명

실기기 development/preview 빌드에는 Apple Developer Program 계정이 필요하다.

```bash
npx eas-cli@latest device:create
npx eas-cli@latest credentials --platform ios
```

자격 증명 화면에서 다음 항목을 EAS 원격 관리로 생성하거나 연결한다.

- Apple Distribution Certificate
- Ad Hoc Provisioning Profile
- Apple Push Notifications Key

APNs 키는 Apple Developer 계정당 최대 2개이므로 기존 서비스에서 사용하는 키를
임의로 폐기하지 않는다.

## 3. 빌드

```bash
# iOS 시뮬레이터
npx eas-cli@latest build --platform ios --profile simulator

# 등록된 iPhone 내부 배포
npx eas-cli@latest build --platform ios --profile development
npx eas-cli@latest build --platform ios --profile preview

# TestFlight/App Store용
npx eas-cli@latest build --platform ios --profile production
```

`production` 프로필은 EAS의 원격 빌드 번호를 사용하고 빌드마다 자동 증가한다.

GitHub Actions의 `Mobile EAS Build` 워크플로에서도 동일한 빌드를 수동 실행할 수 있다.
저장소 Actions Secret에 Expo 개인 액세스 토큰을 `EXPO_TOKEN` 이름으로 등록해야 한다.
토큰은 Expo 계정의 Personal access tokens 화면에서 발급하고 소스 코드에는 넣지 않는다.

## 4. 푸시 검증

1. development 또는 preview 빌드를 실제 iPhone에 설치한다.
2. 로그인 후 앱의 `알림 설정`에서 알림 받기를 켠다.
3. 서버의 `DevicePushToken`에 해당 계정과 기기의 토큰이 등록되는지 확인한다.
4. 질문 등록/답변과 수행평가 제출/피드백 흐름을 각각 실행한다.
5. `/api/cron/mobile-push-receipts` 결과와 `PushNotificationReceipt` 상태를 확인한다.

## 5. TestFlight 제출

최초 제출 전 App Store Connect에서 앱과 번들 ID
`com.studyroommanager.mobile`을 생성한다.

```bash
npx eas-cli@latest submit --platform ios --profile production
```

Apple ID, Apple Team ID, App Store Connect App ID가 확정되면 로컬 파일 대신 EAS
Submit 프롬프트 또는 EAS 환경변수로 제공한다. App Store Connect API Key를 사용할
경우 `.p8` 파일을 저장소에 추가하지 않는다.

## 6. Android 후속 출시

```bash
npx eas-cli@latest credentials --platform android
npx eas-cli@latest build --platform android --profile preview
npx eas-cli@latest build --platform android --profile production
npx eas-cli@latest submit --platform android --profile production
```

Android 원격 푸시 전에는 Expo 프로젝트에 FCM V1 서비스 계정을 연결해야 한다.
Google Play 첫 제출은 콘솔에서 수동으로 완료한 뒤 EAS Submit 자동화를 사용한다.
