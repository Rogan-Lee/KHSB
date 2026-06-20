# 자체 인증 전환

웹과 모바일 앱은 Better Auth를 사용하며 인증 데이터는 Supabase PostgreSQL에 저장한다.
기존 `User`와 `Student`의 PK는 변경하지 않고 `AuthUser`가 1:1로 연결된다.

## 환경변수

웹과 API:

```text
BETTER_AUTH_SECRET=<32바이트 이상의 무작위 문자열>
BETTER_AUTH_URL=https://서비스도메인
NEXT_PUBLIC_APP_URL=https://서비스도메인
RESEND_API_KEY=<비밀번호 재설정 메일 발송 키>
AUTH_EMAIL_FROM=스터디룸 매니저 <account@인증된도메인>
```

Expo 빌드:

```text
EXPO_PUBLIC_API_URL=https://서비스도메인
```

## 배포 순서

1. 데이터베이스 백업을 만든다.
2. `prisma/migrations/20260619070000_add_self_hosted_auth/migration.sql`을 적용한다.
3. 새 인증 환경변수를 Preview에 설정한다.
4. 최초 원장 가입 링크를 발급한다.

```bash
npm run auth:bootstrap -- director@studyroom.kr
```

5. 링크에서 원장 계정을 만든다.
6. `/admin/auth`에서 직원과 학생 초대를 발급한다.
7. Preview에서 웹 로그인, 앱 로그인, 로그아웃, 비밀번호 변경·재설정을 검증한다.
8. 검증 후 Production을 전환한다.

`User.clerkId`는 롤백을 위해 당분간 보존하지만 런타임에서는 사용하지 않는다.
전환 안정화 후 별도 마이그레이션으로 컬럼과 Clerk 환경변수를 제거한다.

이 문서의 bootstrap과 마이그레이션 명령은 프로덕션 데이터에 쓰기를 수행한다.
백업과 배포 승인을 받은 뒤 실행해야 한다.
