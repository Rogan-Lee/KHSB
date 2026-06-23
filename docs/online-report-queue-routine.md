# 예약 생성 — Claude 야간 루틴 사양

학부모 리포트의 **예약 생성** 파이프라인. 근무자가 낮에 "예약 등록"하면 항목이
`QUEUED` 상태로 큐에 쌓이고, **봉인된 프롬프트**(systemPrompt + userPrompt)가 저장된다.
이 루틴이 그 프롬프트만 받아 생성하므로 **DB 자격증명이 필요 없다**.

두 개의 큐 엔드포인트가 **동일한 계약**(GET=봉인 프롬프트 / POST=결과 반영)을 따른다.
하나의 `/schedule` 에이전트가 두 URL을 순차 처리하면 된다.

| 엔드포인트 | 큐 대상 |
|---|---|
| `/api/cron/online-report-queue` | 온라인 학부모 주간/월간 리포트 **본문 전체** (`OnlineParentReport`) |
| `/api/cron/report-ai-queue` | 본원 월간 **종합의견** + 멘토링 **코멘트** AI 텍스트 (`ReportAiJob`) |

생성 결과는 각 시스템의 타깃 필드(온라인=리포트 본문 DRAFT / 본원=`mentoringSummary` /
멘토링=`customNote`)에 자동 반영된다.

## 연동 엔드포인트 (`/api/cron/online-report-queue`, `/api/cron/report-ai-queue`)

인증: `Authorization: Bearer ${CRON_SECRET}` (두 엔드포인트 공통)

- `GET ?limit=30` → 대기 항목(오래된 순) 최대 30건:
  ```json
  { "ok": true, "count": 3, "items": [
    { "reportId": "...", "studentName": "홍길동", "type": "WEEKLY",
      "periodStart": "2026-06-08", "periodEnd": "2026-06-14",
      "systemPrompt": "...", "userPrompt": "..." }
  ] }
  ```
- `POST {reportId, markdown}` (또는 `{results:[{reportId, markdown}, ...]}`)
  → 생성 결과 반영, 해당 보고서를 `DRAFT`로 전환. `QUEUED` 상태일 때만 적용(멱등).

## 루틴 설정

- **주기:** 5시간 간격 (`0 */5 * * *`) — Claude Max 롤링 사용량 창과 정렬.
- **회당 처리량(PoC):** 30건.
- **필요 값:** `APP_URL`(= `NEXT_PUBLIC_APP_URL`), `CRON_SECRET`.

## 루틴 프롬프트 (`/schedule` 에 붙여넣기)

```
너는 학부모 리포트 예약 생성 야간 워커다. 아래를 정확히 1회 수행하고 종료한다.

환경:
- APP_URL = <프로덕션 URL>
- CRON_SECRET = <시크릿>
- ENDPOINTS = [
    "/api/cron/online-report-queue",   # 온라인 리포트 본문
    "/api/cron/report-ai-queue"        # 본원 종합의견 + 멘토링 코멘트
  ]

각 ENDPOINT 에 대해 순서대로 아래를 수행한다:
1) 대기 항목을 가져온다:
   curl -s "$APP_URL$ENDPOINT?limit=30" \
        -H "Authorization: Bearer $CRON_SECRET"
2) items 가 비어 있으면 다음 ENDPOINT 로 넘어간다.
3) 각 item 에 대해, 그 item 의 systemPrompt 를 시스템 지시로, userPrompt 를 입력으로
   삼아 결과 텍스트를 생성한다. 프롬프트의 형식·섹션·분량 지시를 그대로 따른다.
   (systemPrompt 가 "JSON 으로만 응답" 을 요구하면 JSON 그대로 보낸다.)
   데이터를 지어내지 말고 주어진 입력에만 근거한다.
4) item 한 건을 완성할 때마다 **즉시** 같은 ENDPOINT 로 결과를 전송한다(부분 실패 안전):
   curl -s -X POST "$APP_URL$ENDPOINT" \
        -H "Authorization: Bearer $CRON_SECRET" \
        -H "Content-Type: application/json" \
        -d '{"reportId":"<item.reportId>","markdown":"<생성한 텍스트>"}'
   (markdown 은 JSON 문자열로 안전하게 이스케이프할 것.)
5) 모든 ENDPOINT 가 끝나면 "총 N건 중 성공 X · 실패 Y" 한 줄로 요약한다.

주의:
- 전송에 성공한 항목은 처리 완료되어 다음 회차에서 다시 잡히지 않는다.
- 전송 못 한 항목은 QUEUED 로 남아 다음 회차(5시간 뒤)가 이어서 처리한다.
- 세션이 길어 중단돼도 이미 전송된 건은 보존되므로, 무리하지 말고 순서대로 처리한다.
- 두 엔드포인트의 응답 형태(items[].reportId / systemPrompt / userPrompt)는 동일하다.
```

## PoC 측정 포인트

1회 실행 후 다음을 확인한다:
- **건당 토큰/소요시간** → ×90 으로 피크일 한 밤 부담 추정, Max 사용량 대비 %.
- **30건이 한 세션에서 깨끗이 완료되는지** → 안 되면 회당 건수를 15~20 으로 하향.
- **DRAFT 품질**(기존 Groq 대비) → `/online/reports` 에서 검토.

측정값에 따라 회당 건수·주기를 확정한다.
