"use client";

import { Button } from "@/components/portal/ui";
import { useVocabExit } from "../_components/vocab-top-bar";

/**
 * 포털 링크가 없을 때(매직링크 만료 등) 결과 화면 하단 "닫기" 버튼.
 * 히스토리가 있으면 뒤로, 없으면 창 닫기를 시도한다.
 */
export function ResultExitButton() {
  const exit = useVocabExit();
  return (
    <Button variant="gray" size="xl" block onClick={exit}>
      닫기
    </Button>
  );
}
