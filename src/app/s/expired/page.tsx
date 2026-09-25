import type { Viewport } from "next";
import { Link2Off, ShieldCheck } from "lucide-react";
import { IconTile } from "@/components/portal/ui";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#FFFFFF",
};

export default function StudentPortalExpiredPage() {
  return (
    <div
      data-portal
      className="flex min-h-[100svh] flex-col bg-bg-layer-default px-6"
      style={{
        paddingTop: "calc(env(safe-area-inset-top) + 24px)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)",
      }}
    >
      <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col items-center justify-center text-center">
        <IconTile icon={Link2Off} tone="bad" size={64} round />
        <h1 className="t9-bold mt-6 text-fg-neutral">
          링크가 만료됐어요
        </h1>
        <p className="t5-regular mt-2 text-fg-neutral-muted">
          이 접속 링크는 더 이상 쓸 수 없어요.
          <br />
          담당 원장님께 새 링크를 요청해 주세요.
        </p>
      </div>
      <div className="mx-auto flex w-full max-w-[420px] gap-2.5 rounded-r4 bg-bg-neutral-weak px-4 py-4 text-left">
        <ShieldCheck className="mt-0.5 h-[18px] w-[18px] shrink-0 text-fg-neutral-subtle" />
        <p className="t4-regular text-fg-neutral-muted">
          링크가 다른 사람에게 노출된 것 같다면 바로 원장님께 알려 주세요. 이전 링크는 무효가 되고
          새 링크가 발급돼요.
        </p>
      </div>
    </div>
  );
}
