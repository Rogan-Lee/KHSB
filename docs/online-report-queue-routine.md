# 리포트 예약 생성

운영진이 낮에 "예약 등록"하면 항목이 `QUEUED` 로 쌓이고, 밤에 서버가 오래 기다린 것부터 만든다.
만들 때는 `src/lib/groq.ts` 의 `groqChat` 하나만 거친다 — 이름·연락처를 가리고 보낸 사실을 `AiTransferLog` 에 남긴다.
예약 내용(학생 기록)을 밖으로 내려 주거나 밖에서 만든 글을 받는 통로는 없다.

| 크론 (`vercel.json`) | 대상 | 결과 |
|---|---|---|
| `/api/cron/report-ai-queue` | 본원 월간 종합의견 · 멘토링 코멘트 (`ReportAiJob`) | `REVIEW` — `/reports/ai-queue` 에서 확인하고 반영해야 리포트에 들어간다 |
| `/api/cron/online-report-queue` | 온라인 주간·월간 보고서 본문 (`OnlineParentReport`) | `DRAFT` — 기존 승인 화면을 거친다 |

- 한 번에 45초까지 처리하고 남은 건은 다음 회차가 이어서 한다. Groq 사용량 한도(429)에 걸리면 그 자리에서 멈춘다.
- 인증은 `Authorization: Bearer ${CRON_SECRET}`.
