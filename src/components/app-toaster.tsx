"use client";

import { usePathname } from "next/navigation";
import { Toaster } from "@/components/ui/sonner";

/**
 * 경로별 토스트 배치. 학생 포털(/s/*)은 SEED Snackbar 모양의 하단 중앙 토스트,
 * 그 외(대시보드 등)는 기존 우상단 richColors 토스트.
 */
export function AppToaster() {
  const pathname = usePathname() ?? "";
  const isPortal = pathname.startsWith("/s/");

  if (!isPortal) return <Toaster richColors position="top-right" />;

  return (
    <Toaster
      position="bottom-center"
      offset={{ bottom: 96 }}
      mobileOffset={{ bottom: "calc(env(safe-area-inset-bottom) + 92px)", left: 16, right: 16 }}
      toastOptions={{
        // SEED Snackbar 규격 — bg.neutral-inverted / fg.neutral-inverted / r2 / t4
        classNames: {
          toast:
            "!min-h-[44px] !rounded-r2 !border-0 !bg-bg-neutral-inverted !px-x4 !py-x2_5 !t4-regular !text-fg-neutral-inverted !shadow-s2 ![font-family:var(--seed-font-family)]",
          description: "!text-fg-neutral-inverted/70",
          icon: "[&_svg]:!h-[18px] [&_svg]:!w-[18px]",
          success: "[&_[data-icon]]:!text-palette-green-400",
          error: "[&_[data-icon]]:!text-palette-red-400",
        },
      }}
    />
  );
}
