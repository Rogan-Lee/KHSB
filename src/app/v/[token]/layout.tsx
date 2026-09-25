import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#FFFFFF",
};

export const metadata: Metadata = {
  title: "영단어 시험 · 강한선배 | KHSB",
  description: "영단어 온라인 시험 응시 페이지",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "영단어 시험" },
  formatDetection: { telephone: false },
};

// 학생 포털과 같은 SEED 영역 — 흰 바탕 앱 화면
export default function VocabExamLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-portal
      data-seed-color-mode="light-only"
      className="min-h-[100svh] bg-bg-layer-default"
      // 상단 safe-area 는 각 화면의 VocabTopBar 가 처리
      style={{ "--portal-surface": "var(--seed-color-bg-layer-default)" } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
