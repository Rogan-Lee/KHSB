import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#FFFFFF",
};

export const metadata: Metadata = {
  title: "영단어 시험 · 스터디룸 매니저",
  description: "영단어 온라인 시험 응시 페이지",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "영단어 시험" },
  formatDetection: { telephone: false },
};

export default function VocabExamLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-[100svh] bg-canvas"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {children}
    </div>
  );
}
