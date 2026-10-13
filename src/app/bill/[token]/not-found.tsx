import { FileX2 } from "lucide-react";
import { IconTile } from "@/components/portal/ui";

/** 없는 토큰 — 링크가 잘렸거나 틀린 경우. 사유는 구분해 알려 주지 않는다 */
export default function BillNotFound() {
  return (
    <div
      data-portal
      data-seed-color-mode="light-only"
      className="flex min-h-[100svh] flex-col items-center justify-center bg-bg-layer-default px-x6 text-center"
    >
      <IconTile icon={FileX2} tone="gray" size={64} round />
      <h1 className="mt-x6 t9-bold text-fg-neutral">청구서를 찾을 수 없어요</h1>
      <p className="mt-x2 t5-regular text-fg-neutral-muted">
        링크가 정확한지 확인해 주세요.
        <br />
        계속 열리지 않으면 독서실로 문의해 주세요.
      </p>
    </div>
  );
}
