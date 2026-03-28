# 독서실 관리 시스템 (Study Room Manager)

관리형 독서실 원생 종합 관리 웹앱. Next.js 16 App Router 기반.

## 주요 기능

- **원생 관리**: 입퇴실 일정, 외출/복귀 시간, 좌석 배정
- **출결 관리**: 입실/퇴실/외출 기록, 월간 출결 통계
- **멘토링**: 주간 계획 보드, AI 리포트 작성 (Groq LLaMA 3.3 70B), 학부모 리포트 공유
- **상벌점**: 부여/조회/기간별 분석/월별 랭킹
- **회의록**: 팀별 탭 지원
- **인수인계/투두**: 인수인계 보드, 체크리스트, 루틴 관리
- **메시지**: 카카오톡 학부모 공유, 템플릿 메시지
- **구글 연동**: Google Calendar, Google Sheets 원생 정보 연동

## 기술 스택

- **Framework**: Next.js 16 (App Router), React 19, TypeScript 5
- **DB**: Neon Serverless (PostgreSQL) + Prisma v7
- **Auth**: Clerk
- **UI**: shadcn/ui + TailwindCSS v4 + Lucide React
- **AI**: Groq SDK (LLaMA 3.3 70B)
- **Deployment**: Vercel (icn1, 서울 리전)

## 개발 환경 설정

```bash
npm install
cp .env.example .env.local  # 환경변수 설정
npm run db:push              # DB 스키마 반영
npm run dev                  # 개발 서버 (http://localhost:3000)
```

## 테스트

```bash
npm test                # 단위 테스트 실행 (vitest)
npm run test:coverage   # 커버리지 포함
```

## 환경변수

| 변수 | 설명 |
|------|------|
| `DATABASE_URL` | Neon PostgreSQL 연결 문자열 |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk 공개 키 |
| `CLERK_SECRET_KEY` | Clerk 시크릿 키 |
| `GROQ_API_KEY` | Groq AI API 키 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth |

## 배포

Vercel에 연결된 GitHub 저장소. `main` 브랜치 머지 시 자동 배포.

```bash
npm run build   # 프로덕션 빌드 확인
```
