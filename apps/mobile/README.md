# 스터디룸 매니저 모바일

Expo SDK 56과 Expo Router로 구성한 iOS 우선 모바일 앱입니다. 동일 코드베이스로 Android 출시를 준비합니다.

## 현재 범위

- Better Auth 이메일/아이디 로그인과 SecureStore 세션
- 초대 링크 기반 학생·운영진 계정 활성화
- 학생 홈, 관리 프로그램, 질의응답 실데이터 조회
- 운영진 홈, 입퇴실, 멘토링, 질의응답 실데이터 조회
- 학생 질문 작성·추가 질문과 운영진 답변
- 입실·외출·복귀·퇴실·결석 처리
- 멘토링 상세 확인과 상담 완료 기록
- 질문·답변과 멘토링 사진 첨부
- 근무 기록, 인수인계, 순찰 QR
- 학생 수행평가 제출과 운영진 피드백·승인
- 알림 권한·종류 설정, 수행평가 마감 로컬 알림
- 질의응답·수행평가 원격 푸시와 Expo 영수증 처리
- 역할별 API 권한 검증과 당겨서 새로고침
- 비밀번호 변경, 다른 기기 로그아웃, 계정 삭제

## 실행

정상 동작하는 Node.js 22 이상 환경에서 실행합니다.

```bash
npm install
npm run ios
```

웹 레이아웃 확인:

```bash
npm run web
```

## 원격 푸시 설정

실기기 원격 푸시에는 EAS 프로젝트와 iOS/Android 푸시 자격 증명이 필요합니다.

```bash
EXPO_PUBLIC_API_URL=https://example.com
EXPO_PUBLIC_EAS_PROJECT_ID=123e4567-e89b-12d3-a456-426614174000
```

서버에는 선택적으로 Expo Push Security의 `EXPO_ACCESS_TOKEN`을 설정합니다.
푸시 영수증은 GitHub Actions가 `CRON_SECRET`으로 보호된
`/api/cron/mobile-push-receipts`를 15분마다 호출해 확인합니다. 배포 전
`20260621030000_add_mobile_push_notifications` 마이그레이션을 승인된 DB 배포
절차로 적용해야 합니다.

## EAS 빌드

EAS 프로필은 다음 용도로 분리되어 있습니다.

- `simulator`: iOS 시뮬레이터 개발 클라이언트
- `development`: 등록된 실기기 개발 클라이언트
- `preview`: 운영 환경을 사용하는 내부 테스트 빌드
- `production`: TestFlight/App Store 및 Google Play 빌드

Expo 프로젝트 연결, Apple 자격 증명, 실기기 푸시 검증 절차는
[`docs/mobile-release.md`](../../docs/mobile-release.md)를 따릅니다.

## 다음 구현

1. 멘토링 일정 원격 푸시
2. Expo 계정 로그인 후 EAS 프로젝트와 Apple 자격 증명 연결
3. TestFlight 내부 테스트와 스토어 메타데이터 준비

`EXPO_PUBLIC_API_URL`에는 API 서버 주소만 설정합니다. 토큰과 개인정보는 소스 코드나
`EXPO_PUBLIC_*` 환경변수에 넣지 않습니다.
