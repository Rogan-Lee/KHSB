import type { Viewport } from "next";
import { ShieldAlert } from "lucide-react";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#F4F4F2",
};

export default function StudentPortalExpiredPage() {
  return (
    <div
      className="grid min-h-[100svh] place-items-center bg-canvas px-4"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="w-full max-w-[420px] rounded-[18px] border border-line bg-panel p-6 text-center shadow-sm">
        <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-bad-soft text-bad-ink">
          <ShieldAlert className="h-7 w-7" strokeWidth={2.4} />
        </div>
        <h1 className="mt-4 text-[18px] font-bold tracking-[-0.01em] text-ink">
          링크가 만료됐어요
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-4">
          이 접속 링크는 더 이상 유효하지 않아요.
          <br />
          담당 원장님께 재발급을 요청해 주세요.
        </p>
        <div className="mt-5 rounded-[12px] bg-canvas-2/60 p-3.5 text-left">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-4">
            안전 안내
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">
            링크가 외부에 노출된 것이 의심되면 즉시 원장님께 알려 주세요. 이전
            링크가 무효화되고 새 링크가 발급돼요.
          </p>
        </div>
      </div>
    </div>
  );
}
