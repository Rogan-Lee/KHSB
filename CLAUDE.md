# Study Room Manager (스터디룸 매니저)

관리형 독서실 전용 올인원 운영 솔루션. 현재 1개 시설(KHSB) 프로덕션 운영 중.

## Tech Stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript 5
- **Styling:** TailwindCSS v4, shadcn/ui
- **ORM:** Prisma v7 + Neon Serverless PostgreSQL (ap-southeast-1)
- **Auth:** Clerk (Google/Kakao OAuth)
- **AI:** Groq SDK (LLaMA 3.3 70B)
- **Deploy:** Vercel (icn1 Seoul)

## Project Structure

```
src/
├── actions/          # Server Actions ("use server")
├── app/
│   ├── (dashboard)/  # 인증된 페이지 (layout에서 auth 체크)
│   └── api/
│       ├── cron/     # 에이전트용 Cron API (CRON_SECRET 인증)
│       ├── google-calendar/
│       ├── kakao/
│       └── upload/
├── components/       # React 컴포넌트 (페이지별 하위 디렉토리)
├── generated/prisma/ # Prisma 생성 코드 (직접 수정 금지)
└── lib/              # 유틸리티, 인증, Prisma 클라이언트
```

## Key Patterns

- **Server Actions:** `src/actions/*.ts`에 `"use server"` 선언. 모든 mutation은 Server Action으로 처리.
- **Auth:** `import { auth } from "@/lib/auth"` → `{ user: { id, role, name } }` 반환
- **Authorization:**
  - `requireFullAccess(role)` — ADMIN/DIRECTOR만 허용
  - `requireStaff(role)` — ADMIN/DIRECTOR/MENTOR/STAFF 허용
  - `requireOwnerOrFullAccess(ownerId, userId, role)` — 소유자 또는 관리자
- **Prisma:** `import { prisma } from "@/lib/prisma"` (PrismaNeon 어댑터)
- **시간 처리:** `todayKST()`, `nowKSTTimeString()`, `toKSTDateTime()` from `@/lib/utils`
- **Slack:** `import { notifySlack } from "@/lib/slack"` — fire-and-forget, 실패해도 비즈니스 로직 미차단
- **Cron API:** `/api/cron/*` routes는 `Authorization: Bearer ${CRON_SECRET}` 필수
- **revalidatePath:** mutation 후 반드시 호출

## Language

- 모든 사용자 대면 텍스트는 **한국어**
- 에러 메시지: `"학생을 찾을 수 없습니다"` 패턴
- 코드 주석/변수명은 영어 가능

## Git Workflow

- `tmp-main`: 고객사 개발 브랜치 (주로 여기서 작업)
- `main`: 프로덕션 (tmp-main → main PR로 배포)
- 에이전트는 feature branch → PR만 허용. main 직접 push 금지.

## Do NOT

- `prisma/schema.prisma` 직접 수정 (승인 없이)
- `main` 브랜치에 직접 push
- 프로덕션 데이터 삭제/수정
- `generated/prisma/` 내 파일 직접 수정
- 환경변수(DATABASE_URL, CRON_SECRET 등)를 클라이언트 코드에 노출
