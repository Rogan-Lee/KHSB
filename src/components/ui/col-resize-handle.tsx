"use client";

/**
 * 테이블 헤더(th) 오른쪽 가장자리에 붙는 열 너비 드래그 핸들.
 * 사용처 th 는 `relative` 여야 함. 드래그하면 onResize(새 너비 px) 호출.
 */
export function ColResizeHandle({
  current,
  onResize,
}: {
  current: number;
  onResize: (width: number) => void;
}) {
  function handlePointerDown(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = current;
    const move = (ev: PointerEvent) => onResize(startW + (ev.clientX - startX));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  return (
    <span
      onPointerDown={handlePointerDown}
      onClick={(e) => e.stopPropagation()}
      role="separator"
      aria-orientation="vertical"
      title="드래그하여 열 너비 조절"
      className="group absolute top-0 right-0 z-[1] flex h-full w-2 cursor-col-resize touch-none select-none items-stretch justify-center"
    >
      {/* 항상 보이는 얇은 구분선 — 호버 시 굵고 진하게 */}
      <span className="h-full w-px bg-border transition-colors group-hover:w-0.5 group-hover:bg-primary/60 group-active:bg-primary" />
    </span>
  );
}
