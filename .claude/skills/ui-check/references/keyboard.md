# 키보드·뷰포트

## 역할 나누기

| 층 | 담당 | 대상 |
|---|---|---|
| 앱 | 우리 코드 | viewport meta, `dvh`, `visualViewport` 추적, 하단 고정 CTA, 포커스 스크롤, safe-area |
| 컴포넌트 | SEED | BottomSheet·TextField·Dialog 안의 키보드 처리 |

컴포넌트 층은 seed-docs MCP(`get_docs_component`, `get_react_component`)로 먼저 확인한다. 지금까지 확인한 것:

- **SEED BottomSheet**(`@seed-design/react-drawer`)는 `visualViewport` 로 키보드에 맞춰 시트 위치를 스스로 옮긴다. 문서에도 "키보드가 나타날 경우 시트 높이가 함께 달라질 수 있다"고 나온다. 시트 안에 우리 키보드 코드를 덧대지 않는다. 이상하면 보고만 한다.
- **SEED TextField**: `size="large"` 는 16px, `medium` 은 14px 라 iOS 가 포커스 때 확대한다. `TextFieldInput` 은 `<input>` 속성(`type`, `inputMode`, `enterKeyHint`, `autoComplete`)을 그대로 받는다.

## 브라우저마다 다른 점

- **Android Chrome**: viewport 에 `interactive-widget=resizes-content` 가 있으면 키보드가 뜰 때 레이아웃 뷰포트가 줄어서 `dvh` 와 `fixed bottom-0` 이 키보드 위로 올라온다. 없으면(기본 `resizes-visual`) 고정 요소가 키보드 뒤에 남는다.
- **iOS Safari**: `interactive-widget` 을 무시한다. 보이는 영역(visual viewport)만 줄고 레이아웃·`dvh` 는 그대로라, `fixed bottom-0` 은 키보드 뒤에 숨는다. 키보드 위에 붙여야 하는 UI 는 `visualViewport` 로 맞춘다.
- **데스크톱·Playwright**: 가상 키보드가 없다. 키보드 동작은 실기기에서만 확인된다.

Next 에서는 이렇게 설정한다(페이지나 레이아웃의 `export const viewport`):

```ts
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};
```

## visualViewport 공용 훅

아직 `src` 에 공용 훅이 없다(`grep -rn visualViewport src` 로 먼저 확인). 처음 필요해지면 `src/hooks/` 에 하나만 만들고 이후엔 재사용한다.

```tsx
"use client";
import { useEffect } from "react";

// Sets --kb-inset on <html>: how far the on-screen keyboard covers the layout viewport (0 when closed).
export function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty("--kb-inset", `${inset}px`);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      document.documentElement.style.removeProperty("--kb-inset");
    };
  }, []);
}
```

- 쓰는 쪽: `style={{ bottom: "var(--kb-inset, 0px)" }}`.
- Android 에서 `resizes-content` 면 `innerHeight` 도 같이 줄어 값이 0 이 된다. 정상이다.
- iOS 추천 바가 켜졌다 꺼지며 높이가 흔들리면, 높이만 바뀐 변화는 디바운스한다(수백 ms).

## 하단 고정 CTA

키보드가 열렸을 때의 동작을 둘 중 하나로 정하고 코드 주석에 적는다.

- **따라 올라감**: 채팅 입력, 한두 칸짜리 폼. `bottom: var(--kb-inset)`.
- **숨기거나 흐름에 둠**: 긴 폼. 키보드가 열리면 숨기거나 버튼을 폼 끝에 둔다. 마지막 칸은 `enterKeyHint="done"`.

어느 쪽이든 CTA 높이만큼 본문 아래 여백을 두고 `env(safe-area-inset-bottom)` 을 더한다. 포털은 `BottomCTA`(`src/components/portal/ui.tsx`)가 여백·safe-area 를 이미 처리하니 재사용한다(키보드 대응은 아직 없음).

## 포커스

- 키보드가 다 올라온 뒤(`visualViewport` resize 이벤트 또는 짧은 지연) `el.scrollIntoView({ block: "nearest" })`.
- 고정·스크롤 컨테이너 안에서 코드로 포커스할 땐 `el.focus({ preventScroll: true })` 후 필요한 만큼만 직접 스크롤한다.
- `html` 에 `overflow: hidden` 을 걸지 않는다. 오버레이 스크롤 잠금은 SEED·Radix 가 한다.

## 실기기에서만 확인되는 것

ui-check 보고의 "실기기 확인 필요" 에 해당 항목을 골라 적는다.

- iOS Safari, Android Chrome 각각: 입력칸 탭 → 키보드가 입력칸·하단 CTA 를 가리는지, 화면이 튀는지, 키보드를 닫은 뒤 원래 위치로 돌아오는지.
- iOS 자동완성 바·비밀번호 제안이 붙었을 때 높이, 한글 자판과 영문 자판 높이 차이.
- 노치·홈 인디케이터 safe-area, 가로 모드.
- 바텀시트 안 입력칸: 시트가 키보드 위로 올라오는지(SEED 처리, 이상하면 보고만).
