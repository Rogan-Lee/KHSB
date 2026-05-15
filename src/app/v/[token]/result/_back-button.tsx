"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * 결과 페이지에서 이전 화면으로 돌아가는 버튼.
 * 학생 포털(/s/[token])에서 진입한 경우 history.back() 으로 포털로 돌아간다.
 * 히스토리가 비어있으면(직접 링크 진입) 창을 닫기를 시도.
 */
export function BackButton({ label = "뒤로 가기" }: { label?: string }) {
  const router = useRouter();
  const handleClick = () => {
    // App Router 의 router.back() 은 동기적으로 결과가 안 잡힘 — 단순 호출
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      // 직접 링크로 열린 경우: 창 닫기 시도, 실패하면 그대로 둔다
      window.close();
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center justify-center gap-1.5 rounded-[12px] border border-line bg-panel px-4 py-3 text-[14px] font-semibold text-ink-2 active:scale-[0.99] hover:bg-canvas-2 transition-all"
    >
      <ArrowLeft className="h-4 w-4" strokeWidth={2.4} />
      {label}
    </button>
  );
}
