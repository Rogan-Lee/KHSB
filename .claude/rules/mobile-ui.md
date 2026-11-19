---
paths:
  - "src/app/**/*.tsx"
  - "src/components/**/*.tsx"
  - "src/**/*.css"
  - "landing/*.html"
  - "landing/*.css"
---

# 모바일 UI 규칙

상세 설명과 검증 절차는 `ui-check` 스킬에 있다. UI 를 고친 뒤엔 그 스킬을 돌린다.

## SEED 먼저 (가장 우선)

- 우선순위: SEED 컴포넌트·토큰 > 이 체크리스트 > 범용 스킬(web-design-guidelines, mobile-ux-optimizer). 범용 스킬은 빠진 UX(상태·접근성·키보드·폼 속성)를 찾는 데만 쓴다. 색·간격·타이포·radius 는 SEED 토큰만 쓰고 임의 값은 제안하지도 넣지도 않는다.
- SEED 에 있는 컴포넌트는 직접 만들지 않는다(`src/seed-design/ui/*`, `@seed-design/react`, 전체 목록은 seed-docs MCP `list_react_components`).
- SEED 컴포넌트 내부 스타일을 커스텀 CSS 로 덮지 않는다. 체크리스트와 어긋나 보여도 고치지 말고 보고만 한다.
- 키보드·뷰포트: 앱 레벨(viewport meta, dvh, visualViewport, 하단 고정 CTA)은 우리가 처리한다. 컴포넌트 레벨(BottomSheet, TextField 등)은 SEED 문서에서 지원 여부부터 확인한다.
- `src/seed-design/`(SEED CLI 스니펫)은 검사·수정 대상이 아니다. `landing/` 은 SEED 대신 `bx-core.css` 토큰을 쓴다.

## 체크리스트

1. `100vh`·`h-screen`·`min-h-screen` 금지, `100dvh`(`h-dvh`, `min-h-dvh`)를 쓴다.
2. iOS 는 `interactive-widget` 을 무시한다. 키보드 위에 붙어야 하는 UI 는 `visualViewport` 로 높이를 추적한다.
3. viewport 에 `interactiveWidget: "resizes-content"`, `viewportFit: "cover"`(Next `export const viewport`).
4. 입력칸 글자는 16px 이상(iOS 확대 방지). SEED TextField 는 `size="large"`(16px), `medium` 은 14px.
5. 입력칸에 포커스가 가면 키보드에 가리지 않게 `scrollIntoView({ block: "nearest" })`.
6. 하단 고정 CTA 는 키보드가 열렸을 때 어떻게 할지(따라 올라감 / 숨김) 코드에 적는다.
7. 입력칸마다 `type`·`inputMode`·`enterKeyHint`·`autoComplete` 를 정한다.
8. 화면 가장자리에 고정된 요소는 `env(safe-area-inset-*)` 만큼 띄운다.
9. `html` 에 `overflow: hidden` 금지. 스크롤 잠금은 SEED·Radix 오버레이에 맡긴다.
10. hover 효과는 `@media (hover: hover)` 안에서만(Tailwind v4 `hover:` 는 이미 그렇게 동작, 직접 쓴 CSS 가 대상).
11. 터치 영역 44px 이상. SEED 컴포넌트는 기본 size 그대로, 직접 만든 탭 영역은 `min-h-11 min-w-11`.
12. 데이터 화면엔 빈·로딩·에러 상태가 다 있고, 제출 버튼은 처리 중 비활성으로 중복 제출을 막는다.
